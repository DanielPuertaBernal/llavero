"""
Tests de auth/service.py contra una base de datos de test real (Postgres,
vía pytest-django) — sin mocks salvo uno: la resolución de la clave pública
de Microsoft (`auth.service._resolver_clave_publica_microsoft`), que por
diseño le pega al JWKS público real de Microsoft por red — inviable e
indeseable en un test.

Para testear la lógica REAL de validación de firma/issuer/audience
(`validar_id_token_microsoft`) sin red ni credenciales reales de Azure:
1. Se genera un par de claves RSA de prueba (`cryptography`) una sola vez
   por módulo de test (`_CLAVE_PRIVADA_TEST`/`_CLAVE_PUBLICA_TEST`).
2. Se firma un id_token falso con la clave PRIVADA de test
   (`_id_token_de_prueba`), con los claims que Microsoft incluiría
   (`email`, `oid`, `iss`, `aud`, `exp`).
3. Se monkeypatchea `auth.service._resolver_clave_publica_microsoft` para
   que devuelva la clave PÚBLICA de test en vez de consultar el JWKS real
   de Microsoft — el resto de `validar_id_token_microsoft` (verificación de
   firma con `jwt.decode`, issuer, audience) corre sin mocks adicionales,
   así que si esa lógica está mal (algoritmo incorrecto, no valida
   audience/issuer, etc.) el test lo detecta igual que en producción.

`AZURE_TENANT_ID=test-tenant`/`AZURE_CLIENT_ID=test-client` (ver variables
de entorno del comando de test) son los valores contra los que se valida
`iss`/`aud` acá — ninguno es una credencial real de Azure.
"""

from datetime import datetime, timedelta, timezone as dt_timezone

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.utils import timezone as dj_timezone
from ninja_jwt.tokens import AccessToken, RefreshToken

from auth import repository, service
from catalogos import service as catalogos_service
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db

# ------------------------------------------------------------------
# Infraestructura de test: par de claves RSA propio (no las de Microsoft)
# ------------------------------------------------------------------

_CLAVE_PRIVADA_TEST = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_CLAVE_PUBLICA_TEST = _CLAVE_PRIVADA_TEST.public_key()

_CLAVE_PRIVADA_PEM = _CLAVE_PRIVADA_TEST.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)


def _issuer_valido():
    return f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/v2.0"


def _id_token_de_prueba(
    email="ana.perez@uco.edu.co",
    oid="oid-microsoft-123",
    issuer=None,
    audience=None,
    expirado=False,
    sin_email=False,
    sin_oid=False,
):
    payload = {
        "iss": issuer if issuer is not None else _issuer_valido(),
        "aud": audience if audience is not None else settings.AZURE_CLIENT_ID,
        "exp": datetime.now(dt_timezone.utc) + timedelta(minutes=-5 if expirado else 5),
        "iat": datetime.now(dt_timezone.utc) - timedelta(minutes=10),
    }
    if not sin_email:
        payload["email"] = email
    if not sin_oid:
        payload["oid"] = oid
    return jwt.encode(payload, _CLAVE_PRIVADA_PEM, algorithm="RS256")


@pytest.fixture(autouse=True)
def _usar_clave_publica_de_prueba(monkeypatch):
    """Reemplaza la resolución de clave pública contra el JWKS real de
    Microsoft por la clave pública de prueba generada arriba — así los
    tokens firmados con `_CLAVE_PRIVADA_TEST` verifican correctamente sin
    red ni credenciales reales de Azure."""
    monkeypatch.setattr(
        service, "_resolver_clave_publica_microsoft", lambda id_token: _CLAVE_PUBLICA_TEST
    )


def _usuario(email="ana.perez@uco.edu.co", activo=True, oid_microsoft=None):
    sufijo = email.split("@")[0]
    rol = catalogos_service.crear_rol(f"rol-auth-{sufijo}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-auth-{sufijo}")
    usuario = usuarios_service.crear_usuario("Ana Pérez", email, rol.id, ubicacion.id, activo=activo)
    if oid_microsoft is not None:
        usuarios_service.vincular_oid_microsoft(email, oid_microsoft)
        usuario = usuarios_service.obtener_usuario(usuario.id)
    return usuario


# ------------------------------------------------------------------
# validar_id_token_microsoft
# ------------------------------------------------------------------


def test_validar_id_token_con_firma_valida_devuelve_el_payload():
    id_token = _id_token_de_prueba(email="valido@uco.edu.co", oid="oid-1")

    payload = service.validar_id_token_microsoft(id_token)

    assert payload["email"] == "valido@uco.edu.co"
    assert payload["oid"] == "oid-1"


def test_validar_id_token_con_firma_invalida_es_rechazado():
    otra_clave_privada = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    otra_clave_pem = otra_clave_privada.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    id_token_firmado_con_otra_clave = jwt.encode(
        {
            "iss": _issuer_valido(),
            "aud": settings.AZURE_CLIENT_ID,
            "exp": datetime.now(dt_timezone.utc) + timedelta(minutes=5),
            "email": "atacante@uco.edu.co",
            "oid": "oid-atacante",
        },
        otra_clave_pem,
        algorithm="RS256",
    )

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.validar_id_token_microsoft(id_token_firmado_con_otra_clave)


def test_validar_id_token_con_issuer_incorrecto_es_rechazado():
    id_token = _id_token_de_prueba(issuer="https://login.microsoftonline.com/otro-tenant/v2.0")

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.validar_id_token_microsoft(id_token)


def test_validar_id_token_con_audience_incorrecta_es_rechazado():
    id_token = _id_token_de_prueba(audience="otro-client-id")

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.validar_id_token_microsoft(id_token)


def test_validar_id_token_expirado_es_rechazado():
    id_token = _id_token_de_prueba(expirado=True)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.validar_id_token_microsoft(id_token)


def test_validar_id_token_sin_email_es_rechazado():
    id_token = _id_token_de_prueba(sin_email=True)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.validar_id_token_microsoft(id_token)


def test_validar_id_token_sin_oid_es_rechazado():
    id_token = _id_token_de_prueba(sin_oid=True)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.validar_id_token_microsoft(id_token)


# ------------------------------------------------------------------
# generar_state / construir_url_autorizacion_microsoft
# ------------------------------------------------------------------


def test_generar_state_produce_un_string_no_vacio():
    assert isinstance(service.generar_state(), str) and service.generar_state()


def test_generar_state_produce_valores_distintos_cada_vez():
    assert service.generar_state() != service.generar_state()


def test_construir_url_autorizacion_microsoft_incluye_los_parametros_esperados():
    url = service.construir_url_autorizacion_microsoft()

    assert url.startswith(
        f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/authorize?"
    )
    assert f"client_id={settings.AZURE_CLIENT_ID}" in url
    assert "response_type=code" in url
    assert "response_mode=query" in url
    assert "state=" in url


def test_construir_url_autorizacion_microsoft_sin_login_hint_no_cambia():
    # Regresión: sin login_hint, la URL debe seguir sin ese parámetro.
    url = service.construir_url_autorizacion_microsoft(login_hint=None)

    assert "login_hint" not in url


def test_construir_url_autorizacion_microsoft_con_login_hint_lo_incluye():
    url = service.construir_url_autorizacion_microsoft(login_hint="nombre@uco.edu.co")

    assert "login_hint=nombre%40uco.edu.co" in url


def test_construir_url_autorizacion_microsoft_con_login_hint_hostil_no_rompe_el_prefijo_pinneado():
    # Threat matrix: el login_hint no debe poder inyectar un redirect_uri/host
    # distinto — la URL sigue empezando por el prefijo pinneado del tenant.
    login_hint_hostil = "x@uco.edu.co&redirect_uri=https://evil.example.com"

    url = service.construir_url_autorizacion_microsoft(login_hint=login_hint_hostil)

    assert url.startswith(
        f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/authorize?"
    )


# ------------------------------------------------------------------
# procesar_callback_microsoft (mockea _intercambiar_code_por_id_token —
# mismo patrón que _resolver_clave_publica_microsoft: aísla la llamada de
# red real a Microsoft para poder testear el resto de la lógica sin red).
# ------------------------------------------------------------------


def _mockear_intercambio_de_code(monkeypatch, id_token):
    monkeypatch.setattr(service, "_intercambiar_code_por_id_token", lambda code: id_token)


def test_procesar_callback_con_state_y_code_validos_genera_codigo_de_intercambio(monkeypatch):
    _usuario(email="callback@uco.edu.co")
    id_token = _id_token_de_prueba(email="callback@uco.edu.co", oid="oid-callback")
    _mockear_intercambio_de_code(monkeypatch, id_token)
    state = service.generar_state()

    codigo = service.procesar_callback_microsoft("un-code-cualquiera", state)

    assert isinstance(codigo, str) and codigo
    registro = repository.obtener_codigo_login_temporal(codigo)
    assert registro is not None
    assert registro.usado is False


def test_procesar_callback_con_state_invalido_es_rechazado(monkeypatch):
    llamado = []
    monkeypatch.setattr(
        service, "_intercambiar_code_por_id_token", lambda code: llamado.append(code)
    )

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.procesar_callback_microsoft("un-code", "state-falsificado")

    # El state se valida ANTES de intercambiar el code — si es inválido, no
    # debe llegar a pegarle a Microsoft.
    assert llamado == []


def test_procesar_callback_con_state_expirado_es_rechazado(monkeypatch):
    state = service.generar_state()
    monkeypatch.setattr(service, "_STATE_MAX_AGE_SEGUNDOS", -1)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.procesar_callback_microsoft("un-code", state)


def test_procesar_callback_con_intercambio_de_code_fallido_es_rechazado(monkeypatch):
    def _falla(code):
        raise ValueError("Credenciales inválidas")

    monkeypatch.setattr(service, "_intercambiar_code_por_id_token", _falla)
    state = service.generar_state()

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.procesar_callback_microsoft("code-malo", state)


def test_procesar_callback_con_id_token_invalido_es_rechazado(monkeypatch):
    _mockear_intercambio_de_code(monkeypatch, "esto-no-es-un-jwt")
    state = service.generar_state()

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.procesar_callback_microsoft("code", state)


def test_procesar_callback_vincula_oid_microsoft_en_el_primer_login(monkeypatch):
    usuario = _usuario(email="primera-vez-cb@uco.edu.co")
    assert usuario.oid_microsoft is None
    id_token = _id_token_de_prueba(email="primera-vez-cb@uco.edu.co", oid="oid-nuevo-cb")
    _mockear_intercambio_de_code(monkeypatch, id_token)
    state = service.generar_state()

    service.procesar_callback_microsoft("code", state)

    actualizado = usuarios_service.obtener_usuario_por_email("primera-vez-cb@uco.edu.co")
    assert actualizado.oid_microsoft == "oid-nuevo-cb"


def test_procesar_callback_no_revincula_oid_si_ya_estaba_vinculado(monkeypatch):
    _usuario(email="ya-vinculado-cb@uco.edu.co", oid_microsoft="oid-original")
    id_token = _id_token_de_prueba(email="ya-vinculado-cb@uco.edu.co", oid="oid-original")
    _mockear_intercambio_de_code(monkeypatch, id_token)
    state = service.generar_state()

    service.procesar_callback_microsoft("code", state)

    actualizado = usuarios_service.obtener_usuario_por_email("ya-vinculado-cb@uco.edu.co")
    assert actualizado.oid_microsoft == "oid-original"


def test_procesar_callback_con_usuario_no_precreado_da_error_generico(monkeypatch):
    id_token = _id_token_de_prueba(email="no-existe-cb@uco.edu.co", oid="oid-x-cb")
    _mockear_intercambio_de_code(monkeypatch, id_token)
    state = service.generar_state()

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.procesar_callback_microsoft("code", state)


def test_procesar_callback_con_usuario_inactivo_da_error_generico(monkeypatch):
    _usuario(email="inactivo-cb@uco.edu.co", activo=False)
    id_token = _id_token_de_prueba(email="inactivo-cb@uco.edu.co", oid="oid-inactivo-cb")
    _mockear_intercambio_de_code(monkeypatch, id_token)
    state = service.generar_state()

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.procesar_callback_microsoft("code", state)


# ------------------------------------------------------------------
# intercambiar_codigo_login
# ------------------------------------------------------------------


def _codigo_de_login(monkeypatch, email, oid):
    id_token = _id_token_de_prueba(email=email, oid=oid)
    _mockear_intercambio_de_code(monkeypatch, id_token)
    state = service.generar_state()
    return service.procesar_callback_microsoft("code", state)


def test_intercambiar_codigo_login_con_codigo_valido_emite_tokens(monkeypatch):
    _usuario(email="exchange@uco.edu.co")
    codigo = _codigo_de_login(monkeypatch, "exchange@uco.edu.co", "oid-exchange")

    access, refresh = service.intercambiar_codigo_login(codigo)

    assert isinstance(access, str) and access
    assert isinstance(refresh, str) and refresh
    decodificado = AccessToken(access)
    usuario = usuarios_service.obtener_usuario_por_email("exchange@uco.edu.co")
    assert decodificado["user_id"] == str(usuario.id)


def test_intercambiar_codigo_login_marca_el_codigo_como_usado(monkeypatch):
    _usuario(email="marca-usado@uco.edu.co")
    codigo = _codigo_de_login(monkeypatch, "marca-usado@uco.edu.co", "oid-marca")

    service.intercambiar_codigo_login(codigo)

    registro = repository.obtener_codigo_login_temporal(codigo)
    assert registro.usado is True


def test_intercambiar_codigo_login_persiste_la_sesion_de_refresh(monkeypatch):
    _usuario(email="con-sesion-cb@uco.edu.co")
    codigo = _codigo_de_login(monkeypatch, "con-sesion-cb@uco.edu.co", "oid-y-cb")

    _, refresh = service.intercambiar_codigo_login(codigo)

    jti = RefreshToken(refresh)["jti"]
    assert repository.obtener_por_jti(jti) is not None


def test_intercambiar_codigo_login_con_codigo_ya_usado_es_rechazado(monkeypatch):
    _usuario(email="doble-canje@uco.edu.co")
    codigo = _codigo_de_login(monkeypatch, "doble-canje@uco.edu.co", "oid-doble")
    service.intercambiar_codigo_login(codigo)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.intercambiar_codigo_login(codigo)


def test_intercambiar_codigo_login_con_codigo_inexistente_es_rechazado():
    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.intercambiar_codigo_login("codigo-que-no-existe")


def test_intercambiar_codigo_login_con_codigo_expirado_es_rechazado():
    usuario = _usuario(email="expira-canje@uco.edu.co")
    expirado_hace = dj_timezone.now() - timedelta(seconds=1)
    registro = repository.crear_codigo_login_temporal(usuario.id, "codigo-expirado", expirado_hace)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.intercambiar_codigo_login(registro.codigo)


def test_intercambiar_codigo_login_de_usuario_desactivado_es_rechazado(monkeypatch):
    usuario = _usuario(email="se-desactiva-canje@uco.edu.co")
    codigo = _codigo_de_login(monkeypatch, "se-desactiva-canje@uco.edu.co", "oid-desact-canje")
    otro_admin = _usuario(email="admin-desact-canje@uco.edu.co")
    usuarios_service.desactivar_usuario(usuario.id, otro_admin.id)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.intercambiar_codigo_login(codigo)


def test_flujo_completo_aplica_el_tope_de_sesiones_concurrentes(monkeypatch):
    usuario = _usuario(email="muchas-sesiones@uco.edu.co")
    id_token = _id_token_de_prueba(email="muchas-sesiones@uco.edu.co", oid="oid-z")
    _mockear_intercambio_de_code(monkeypatch, id_token)

    def _login():
        state = service.generar_state()
        codigo = service.procesar_callback_microsoft("code", state)
        return service.intercambiar_codigo_login(codigo)

    for _ in range(5):
        _login()

    activas_antes = repository.listar_sesiones_no_revocadas(usuario.id)
    assert len(activas_antes) == 5

    _login()

    activas_despues = repository.listar_sesiones_no_revocadas(usuario.id)
    assert len(activas_despues) == 5


# ------------------------------------------------------------------
# refrescar_sesion
# ------------------------------------------------------------------


def test_refrescar_sesion_con_refresh_valido_rota_el_token():
    usuario = _usuario(email="refresca@uco.edu.co")
    _, refresh_original = service._emitir_par_de_tokens(usuario)
    jti_original = RefreshToken(refresh_original)["jti"]

    nuevo_access, nuevo_refresh = service.refrescar_sesion(refresh_original)

    assert nuevo_refresh != refresh_original
    assert isinstance(nuevo_access, str) and nuevo_access
    # single-use: el jti original queda revocado.
    assert repository.obtener_por_jti(jti_original).fecha_revocacion is not None
    # el nuevo jti sí queda como sesión activa.
    jti_nuevo = RefreshToken(nuevo_refresh)["jti"]
    assert repository.obtener_por_jti(jti_nuevo).fecha_revocacion is None


def test_refrescar_sesion_con_token_ya_usado_detecta_reuso_y_revoca_todo():
    usuario = _usuario(email="robado@uco.edu.co")
    _, refresh_original = service._emitir_par_de_tokens(usuario)
    # primer refresh: válido, rota el token.
    _, _ = service.refrescar_sesion(refresh_original)

    # reuso: se presenta el mismo refresh_original ya consumido.
    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.refrescar_sesion(refresh_original)

    # detección de reuso revoca TODAS las sesiones del usuario, incluida la
    # que emitió el primer refresh válido (no solo la reusada).
    assert repository.listar_sesiones_no_revocadas(usuario.id) == []


def test_refrescar_sesion_con_jti_inexistente_es_rechazado():
    usuario = _usuario(email="con-otras-sesiones@uco.edu.co")
    service._emitir_par_de_tokens(usuario)

    refresh_falso = str(RefreshToken.for_user(usuario))  # jti nunca persistido

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.refrescar_sesion(refresh_falso)

    # también dispara la revocación total (mismo tratamiento que reuso).
    assert repository.listar_sesiones_no_revocadas(usuario.id) == []


def test_refrescar_sesion_con_token_malformado_da_error_generico():
    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.refrescar_sesion("no-es-un-jwt-valido")


def test_refrescar_sesion_con_access_token_en_vez_de_refresh_es_rechazado():
    usuario = _usuario(email="tipo-incorrecto@uco.edu.co")
    access = str(AccessToken.for_user(usuario))

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.refrescar_sesion(access)


def test_refrescar_sesion_de_usuario_desactivado_es_rechazado():
    usuario = _usuario(email="se-desactiva@uco.edu.co")
    _, refresh = service._emitir_par_de_tokens(usuario)
    otro_admin = _usuario(email="admin-desactiva@uco.edu.co")
    usuarios_service.desactivar_usuario(usuario.id, otro_admin.id)

    with pytest.raises(ValueError, match="Credenciales inválidas"):
        service.refrescar_sesion(refresh)


# ------------------------------------------------------------------
# cerrar_sesion
# ------------------------------------------------------------------


def test_cerrar_sesion_revoca_la_sesion():
    usuario = _usuario(email="logout@uco.edu.co")
    _, refresh = service._emitir_par_de_tokens(usuario)
    jti = RefreshToken(refresh)["jti"]

    service.cerrar_sesion(refresh)

    assert repository.obtener_por_jti(jti).fecha_revocacion is not None


def test_cerrar_sesion_con_token_invalido_no_falla():
    # No debe lanzar nada.
    service.cerrar_sesion("no-es-un-jwt-valido")


def test_cerrar_sesion_con_token_ya_revocado_no_falla():
    usuario = _usuario(email="doble-logout@uco.edu.co")
    _, refresh = service._emitir_par_de_tokens(usuario)

    service.cerrar_sesion(refresh)
    # No debe lanzar en el segundo intento.
    service.cerrar_sesion(refresh)


# ------------------------------------------------------------------
# usuario_desde_access_token
# ------------------------------------------------------------------


def test_usuario_desde_access_token_valido_lo_devuelve():
    usuario = _usuario(email="me@uco.edu.co")
    access = str(AccessToken.for_user(usuario))

    resultado = service.usuario_desde_access_token(access)

    assert resultado.id == usuario.id


def test_usuario_desde_access_token_revalida_activo_en_bd():
    usuario = _usuario(email="se-desactiva-2@uco.edu.co")
    access = str(AccessToken.for_user(usuario))
    otro_admin = _usuario(email="admin-2@uco.edu.co")
    usuarios_service.desactivar_usuario(usuario.id, otro_admin.id)

    # El JWT sigue siendo "válido" (firma/exp ok) pero el usuario ya no está
    # activo — debe rechazarse igual, sin confiar solo en el contenido del
    # token.
    assert service.usuario_desde_access_token(access) is None


def test_usuario_desde_access_token_inexistente_devuelve_none():
    class _UsuarioFantasma:
        id = "00000000-0000-0000-0000-000000000000"

    access = str(AccessToken.for_user(_UsuarioFantasma()))

    assert service.usuario_desde_access_token(access) is None


def test_usuario_desde_access_token_invalido_devuelve_none():
    assert service.usuario_desde_access_token("no-es-un-jwt-valido") is None


def test_usuario_desde_access_token_con_refresh_token_en_vez_de_access_devuelve_none():
    usuario = _usuario(email="tipo-incorrecto-2@uco.edu.co")
    refresh = str(RefreshToken.for_user(usuario))

    assert service.usuario_desde_access_token(refresh) is None
