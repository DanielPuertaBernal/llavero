"""
service.py — API pública del módulo auth.

Autenticación federada con Office 365/Entra ID + JWT propios (ver
AulaSync/analisis/estrategia-migracion/backend.md, sección "Autenticación:
Office 365 (Entra ID) reemplaza el paso de credenciales, no el JWT propio",
y AulaSync/analisis/backend/auth.md para los parámetros exactos portados del
legacy).

Flujo — Authorization Code con callback en el backend (confidential client,
`AZURE_CLIENT_SECRET`), no el flujo implícito con MSAL en el navegador:

1. `GET /login` (controller.py) llama a `construir_url_autorizacion_microsoft`
   y redirige el navegador a Microsoft con un `state` de un solo uso.
2. El usuario se autentica en Microsoft, que redirige de vuelta a
   `GET /callback` con `code`+`state`.
3. `procesar_callback_microsoft` valida el `state` (CSRF, sin sesión de
   servidor — ver `generar_state`/`_validar_state`), intercambia el `code`
   por tokens de Microsoft server-to-server (`_intercambiar_code_por_id_token`)
   y valida el `id_token` resultante contra el JWKS público del tenant —
   `validar_id_token_microsoft` — igual que antes.
4. Con la identidad confirmada (email del id_token), se busca el Usuario
   local por `email_institucional` vía `usuarios.service` — nunca se
   autocrea: el aprovisionamiento es por precreación de un admin. Si no
   existe o no está `activo`, error genérico (no se revela cuál de las dos
   causas fue).
5. En vez de emitir los JWT ahí mismo (el navegador está en medio de un
   redirect, no puede leer un body JSON), se genera un código de intercambio
   opaco de un solo uso (`auth.model.CodigoLoginTemporal`) y se redirige al
   frontend con ese código en la query string.
6. El frontend, ya en su propia página, llama a `POST /exchange` con ese
   código. `intercambiar_codigo_login` lo valida (no usado, no expirado), lo
   marca usado, y recién ahí emite el par de JWT propios
   (`_emitir_par_de_tokens`) — así nunca hay un JWT real flotando en la URL
   del redirect, solo un id opaco de corta duración.

Nota de diseño — por qué NO se usa el blacklist app de `django-ninja-jwt`
(`ninja_jwt.token_blacklist`, modelos `OutstandingToken`/`BlacklistedToken`):
esas tablas declaran FK a `settings.AUTH_USER_MODEL`. Convertir
`usuarios.model.Usuario` en el `AUTH_USER_MODEL` de Django exigiría
heredarlo de `AbstractBaseUser`/`PermissionsMixin` (con un campo `password`
sin uso real, porque no hay login local) — retrabajo innecesario sobre un
módulo ya construido. En su lugar, este módulo usa los primitivos de bajo
nivel `ninja_jwt.tokens.RefreshToken`/`AccessToken` (que solo necesitan algo
con un `id` para `for_user()`, no un `AUTH_USER_MODEL` real) y persiste sus
propias sesiones en `sesion_refresh` (`auth.model.SesionRefresh`),
reimplementando a mano la rotación single-use, la detección de reuso y el
tope de sesiones concurrentes — exactamente lo que hacía
`AuthRepository`/`AuthService` en el legacy (ver auth.md §2-3), solo que
sobre Postgres en vez de sesiones embebidas en el documento de usuario.

Convención de mensajes de error: todas las funciones públicas de este módulo
que pueden fallar (`procesar_callback_microsoft`, `intercambiar_codigo_login`,
`refrescar_sesion`) lanzan siempre el mismo `ValueError` genérico
(`_CREDENCIALES_INVALIDAS`) sin importar la causa concreta (state
inválido/expirado, intercambio con Microsoft fallido, id_token inválido,
usuario inexistente, usuario inactivo, código de intercambio inválido/usado/
expirado, refresh token inválido/reusado) — evita revelar a un atacante cuál
de esas condiciones falló (enumeración de usuarios/emails válidos), mismo
principio que aplicaba el legacy (auth.md §5, "Mensajes genéricos en login").
"""

import secrets
from datetime import timedelta
from urllib.parse import urlencode

import httpx
import jwt
from django.conf import settings
from django.core import signing
from django.utils import timezone
from ninja_jwt.exceptions import TokenError
from ninja_jwt.tokens import AccessToken, RefreshToken
from ninja_jwt.utils import datetime_from_epoch

from auth import domain, repository
from usuarios import service as usuarios_service

_CREDENCIALES_INVALIDAS = "Credenciales inválidas"

_JWKS_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
_AUTHORIZE_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize"
_TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

# Salt de firma del `state` (django.core.signing) — namespacing para que esta
# firma nunca sea intercambiable con otra firma del proyecto que use
# TimestampSigner sobre la misma SECRET_KEY.
_STATE_SALT = "auth.oauth_state"

# Ventana de validez del `state`: no es la duración de una sesión, es cuánto
# tiempo puede tardar el usuario en completar el login interactivo en
# Microsoft (ingresar usuario/contraseña/MFA) antes de que su vuelta a
# /callback se considere sospechosamente vieja. 10 minutos es holgado para
# ese flujo humano sin dejar la ventana de CSRF abierta indefinidamente.
_STATE_MAX_AGE_SEGUNDOS = 600


def _issuer_esperado() -> str:
    return f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/v2.0"


def _resolver_clave_publica_microsoft(id_token: str):
    """Resuelve la clave pública (RS256) que firmó este id_token, contra el
    JWKS público de Microsoft del tenant configurado (`AZURE_TENANT_ID`).

    Aislada en su propia función — sin lógica adicional acá adentro — para
    poder monkeypatchearla en tests (ver tests/test_service.py) y testear
    `validar_id_token_microsoft` de verdad (firma/issuer/audience) sin red
    real ni credenciales de Azure: los tests firman un id_token de prueba
    con una clave RSA propia y monkeypatchean esta función para que
    devuelva la clave pública de esa misma clave de prueba, en vez de
    pegarle al JWKS real de Microsoft.
    """
    url = _JWKS_URL_TEMPLATE.format(tenant_id=settings.AZURE_TENANT_ID)
    jwk_client = jwt.PyJWKClient(url)
    return jwk_client.get_signing_key_from_jwt(id_token).key


def validar_id_token_microsoft(id_token: str) -> dict:
    """Valida el id_token de Microsoft (MSAL) contra el JWKS público del
    tenant configurado: firma RS256, issuer y audience (`AZURE_CLIENT_ID`).

    Devuelve el payload decodificado (incluye `email` y `oid`, los claims
    que este módulo necesita) si el token es válido.

    Lanza `ValueError` (mensaje genérico) ante firma inválida, issuer o
    audience incorrectos, token expirado/malformado, o si faltan los claims
    `email`/`oid` que este módulo necesita para identificar al usuario.
    """
    try:
        clave_publica = _resolver_clave_publica_microsoft(id_token)
        payload = jwt.decode(
            id_token,
            clave_publica,
            algorithms=["RS256"],
            audience=settings.AZURE_CLIENT_ID,
            issuer=_issuer_esperado(),
        )
    except jwt.PyJWTError as exc:
        raise ValueError(_CREDENCIALES_INVALIDAS) from exc

    if not payload.get("email") or not payload.get("oid"):
        raise ValueError(_CREDENCIALES_INVALIDAS)

    return payload


def _emitir_par_de_tokens(usuario) -> tuple[str, str]:
    """Aplica el tope de sesiones concurrentes (revoca las más antiguas si
    hace falta) y emite+persiste un nuevo par access/refresh para `usuario`.
    """
    ahora = timezone.now()
    vigentes = [
        s for s in repository.listar_sesiones_no_revocadas(usuario.id) if domain.sesion_vigente(s, ahora)
    ]
    for sesion in domain.sesiones_a_revocar_por_tope(vigentes):
        repository.revocar(sesion.id, ahora)

    refresh = RefreshToken.for_user(usuario)
    access = refresh.access_token

    repository.crear_sesion(usuario.id, refresh["jti"], datetime_from_epoch(refresh["exp"]))

    return str(access), str(refresh)


def _resolver_usuario_por_id_token(id_token: str):
    """Valida el id_token y resuelve el Usuario local correspondiente — la
    parte de la resolución de identidad que es común a cualquier forma de
    obtener un id_token de Microsoft (antes vivía inline en el extinto
    `login_con_microsoft`, ahora la usa `procesar_callback_microsoft`).

    Nunca autocrea: el aprovisionamiento es por precreación de un admin. Si
    no existe o no está `activo`, error genérico (no revela cuál de las dos
    causas fue). Vincula `oid_microsoft` en el primer login si todavía no
    estaba vinculado.
    """
    payload = validar_id_token_microsoft(id_token)
    email = payload["email"]
    oid = payload["oid"]

    usuario = usuarios_service.obtener_usuario_por_email(email)
    if usuario is None or not usuario.activo:
        raise ValueError(_CREDENCIALES_INVALIDAS)

    if usuario.oid_microsoft is None:
        usuarios_service.vincular_oid_microsoft(email, oid)

    return usuario


def generar_state() -> str:
    """Genera un `state` de un solo uso, firmado con SECRET_KEY
    (`django.core.signing.TimestampSigner`), para proteger `GET /login` ->
    `GET /callback` contra CSRF sin sesión de servidor: el proyecto no tiene
    `SessionMiddleware` configurado (backend stateless, ver settings.py), así
    que en vez de guardar el `state` en una sesión y comparar en el callback,
    se firma acá con un timestamp embebido — `_validar_state` puede verificar
    en `/callback` que la firma es genuina (nadie sin SECRET_KEY pudo
    producirla) y que no es demasiado vieja, sin haber persistido nada.
    """
    return signing.TimestampSigner(salt=_STATE_SALT).sign(secrets.token_urlsafe(16))


def _validar_state(state: str) -> None:
    """Valida el `state` recibido en `/callback`: firma intacta (no
    falsificado) y no más viejo que `_STATE_MAX_AGE_SEGUNDOS`. Lanza
    `ValueError` genérico ante cualquier fallo (firma inválida, expirado,
    formato inesperado) — mismo principio de mensajes genéricos que el resto
    del módulo.
    """
    try:
        signing.TimestampSigner(salt=_STATE_SALT).unsign(state, max_age=_STATE_MAX_AGE_SEGUNDOS)
    except signing.BadSignature as exc:
        raise ValueError(_CREDENCIALES_INVALIDAS) from exc


def construir_url_autorizacion_microsoft(login_hint: str | None = None) -> str:
    """Arma la URL de autorización de Microsoft (Authorization Code,
    `response_mode=query`) para `GET /login`, con un `state` nuevo de un
    solo uso.

    `login_hint` (opcional) prellena el email en el formulario de login de
    Microsoft — viene de la pantalla propia `/login` del frontend (ver
    login-institucional). Se agrega tal cual a `params` (sin validar ni
    sanitizar acá) y `urlencode` ya lo escapa como cualquier otro valor del
    querystring, así que no hay forma de que inyecte otro parámetro o
    cambie el host/tenant pinneado en `base_url`. La validación de dominio
    institucional es solo UX del frontend — acá no se duplica.
    """
    params = {
        "client_id": settings.AZURE_CLIENT_ID,
        "redirect_uri": settings.AZURE_REDIRECT_URI,
        "response_type": "code",
        "response_mode": "query",
        "scope": "openid profile email",
        "state": generar_state(),
    }
    if login_hint:
        params["login_hint"] = login_hint
    base_url = _AUTHORIZE_URL_TEMPLATE.format(tenant_id=settings.AZURE_TENANT_ID)
    return f"{base_url}?{urlencode(params)}"


def _intercambiar_code_por_id_token(code: str) -> str:
    """Intercambia el `code` de autorización por tokens de Microsoft
    (POST server-to-server con `AZURE_CLIENT_SECRET`, confidential client) y
    devuelve el `id_token` de la respuesta.

    Aislada en su propia función — sin lógica adicional acá adentro, mismo
    patrón que `_resolver_clave_publica_microsoft` — para poder
    monkeypatchearla en tests y testear el resto del flujo de `/callback` sin
    red real ni credenciales de Azure (ver tests/test_service.py). Por
    diseño le pega al endpoint real de Microsoft por red — inviable e
    indeseable en un test, igual que `_resolver_clave_publica_microsoft`.
    """
    url = _TOKEN_URL_TEMPLATE.format(tenant_id=settings.AZURE_TENANT_ID)
    data = {
        "client_id": settings.AZURE_CLIENT_ID,
        "client_secret": settings.AZURE_CLIENT_SECRET,
        "code": code,
        "redirect_uri": settings.AZURE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    try:
        respuesta = httpx.post(url, data=data, timeout=10.0)
        respuesta.raise_for_status()
        id_token = respuesta.json().get("id_token")
    except httpx.HTTPError as exc:
        raise ValueError(_CREDENCIALES_INVALIDAS) from exc

    if not id_token:
        raise ValueError(_CREDENCIALES_INVALIDAS)
    return id_token


def _generar_codigo_login_temporal() -> str:
    return secrets.token_urlsafe(32)


def procesar_callback_microsoft(code: str, state: str) -> str:
    """Punto de entrada de `GET /callback` (ver docstring del módulo, pasos
    3-5): valida el `state`, intercambia el `code` por un id_token de
    Microsoft, resuelve el Usuario local y genera un código de intercambio
    opaco de un solo uso en vez de emitir los JWT acá mismo.

    Devuelve el código opaco a incluir en el redirect al frontend
    (`FRONTEND_POST_LOGIN_REDIRECT_URL?code=...`).
    Lanza `ValueError` genérico ante `state` inválido/expirado, intercambio
    con Microsoft fallido, id_token inválido, usuario no precreado, o
    usuario inactivo.
    """
    _validar_state(state)
    id_token = _intercambiar_code_por_id_token(code)
    usuario = _resolver_usuario_por_id_token(id_token)

    ahora = timezone.now()
    codigo = _generar_codigo_login_temporal()
    expiracion = ahora + timedelta(seconds=domain.DURACION_CODIGO_LOGIN_TEMPORAL_SEGUNDOS)
    repository.crear_codigo_login_temporal(usuario.id, codigo, expiracion)

    return codigo


def intercambiar_codigo_login(codigo: str) -> tuple[str, str]:
    """Punto de entrada de `POST /exchange` (ver docstring del módulo, paso
    6): canjea el código opaco emitido por `/callback` por el par de JWT
    reales. Único lugar donde se llama `_emitir_par_de_tokens` en todo el
    flujo Authorization Code.

    Marca el código usado (single-use) antes de emitir los tokens, y
    revalida `activo` en base de datos (mismo principio que
    `refrescar_sesion`/`usuario_desde_access_token`: no confiar solo en un
    estado resuelto minutos antes en `/callback`).

    Devuelve `(access_token, refresh_token)` como strings.
    Lanza `ValueError` genérico si el código no existe, ya fue usado, expiró,
    o el usuario ya no existe/está activo.
    """
    registro = repository.obtener_codigo_login_temporal(codigo)
    ahora = timezone.now()
    if registro is None or not domain.codigo_vigente(registro, ahora):
        raise ValueError(_CREDENCIALES_INVALIDAS)

    repository.marcar_codigo_login_temporal_usado(registro.id)

    usuario = usuarios_service.obtener_usuario(registro.usuario_id)
    if usuario is None or not usuario.activo:
        raise ValueError(_CREDENCIALES_INVALIDAS)

    return _emitir_par_de_tokens(usuario)


def refrescar_sesion(refresh_token: str) -> tuple[str, str]:
    """Refresh con rotación single-use + detección de reuso (ver auth.md
    §4.2): verifica firma/expiración del refresh recibido, busca la sesión
    persistida por `jti`.

    - Si no existe o ya está revocada (`domain.es_intento_de_reuso`): se
      trata como intento de reuso (robo de refresh token) — revoca TODAS
      las sesiones del usuario y rechaza, forzando un re-login completo.
    - Si es válida: la revoca (single-use) y emite un par nuevo.

    Devuelve `(access_token, refresh_token)` nuevos.
    Lanza `ValueError` genérico en cualquier caso de rechazo.
    """
    try:
        token = RefreshToken(refresh_token)
    except TokenError as exc:
        raise ValueError(_CREDENCIALES_INVALIDAS) from exc

    jti = token["jti"]
    usuario_id = token["user_id"]
    sesion = repository.obtener_por_jti(jti)

    if domain.es_intento_de_reuso(sesion):
        repository.revocar_todas_las_del_usuario(usuario_id, timezone.now())
        raise ValueError(_CREDENCIALES_INVALIDAS)

    repository.revocar(sesion.id, timezone.now())

    usuario = usuarios_service.obtener_usuario(usuario_id)
    if usuario is None or not usuario.activo:
        raise ValueError(_CREDENCIALES_INVALIDAS)

    return _emitir_par_de_tokens(usuario)


def cerrar_sesion(refresh_token: str) -> None:
    """Logout: revoca la sesión de refresh correspondiente.

    No lanza si el token ya es inválido/expirado/inexistente — un logout
    con un token que ya no sirve no es un error del cliente, el resultado
    deseado ("sin sesión activa con ese token") ya se cumple. Distinto del
    legacy (auth.md §5, "Logout no invalida el access token — JWT
    stateless"): acá tampoco invalida el access token emitido junto a este
    refresh, sigue válido hasta expirar (8h) o hasta que
    `usuario_desde_access_token` revalide `activo` y lo rechace si el
    usuario fue desactivado mientras tanto.
    """
    try:
        token = RefreshToken(refresh_token)
    except TokenError:
        return

    sesion = repository.obtener_por_jti(token["jti"])
    if sesion is None or sesion.fecha_revocacion is not None:
        return
    repository.revocar(sesion.id, timezone.now())


def usuario_desde_access_token(access_token: str):
    """Verifica el access token (firma + expiración + tipo) y revalida
    `activo` en base de datos en cada llamada — no confía solo en el JWT: si
    un admin desactiva al usuario, pierde acceso de inmediato aunque su
    access token siga vigente (mismo comportamiento que el legacy, ver
    auth.md §5 "Revalidación de activo en cada request").

    Pensada como la primitiva que usará el futuro middleware/dependency de
    Django Ninja para proteger rutas (p. ej. un `HttpBearer` propio pasado a
    `NinjaAPI(auth=...)` o a routers/endpoints puntuales) — todavía no se
    conecta a ningún router de otro módulo acá; ver controller.py, endpoint
    `GET /me`, para el único consumidor actual.

    Devuelve el `Usuario` si el token es válido y el usuario existe y está
    activo; `None` en cualquier otro caso (token inválido/expirado/tipo
    incorrecto, usuario inexistente o inactivo) — un solo resultado "no
    autenticado", sin distinguir la causa.
    """
    try:
        token = AccessToken(access_token)
    except TokenError:
        return None

    usuario = usuarios_service.obtener_usuario(token["user_id"])
    if usuario is None or not usuario.activo:
        return None
    return usuario
