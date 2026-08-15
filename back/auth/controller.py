"""
controller.py — router de Django Ninja del módulo auth.

HTTP puro: valida el request (vía los schemas de Ninja / query params),
llama a `service`, formatea la response. Sin lógica de negocio aquí.

Endpoints — flujo Authorization Code con callback en el backend (confidential
client, ver auth/service.py):

- `GET /login`: redirige (302) el navegador a la URL de autorización de
  Microsoft con un `state` de un solo uso.
- `GET /callback`: recibe `code`+`state` de Microsoft, resuelve el login
  (valida state, intercambia code, valida id_token, resuelve Usuario) y
  redirige (302) al frontend (`FRONTEND_POST_LOGIN_REDIRECT_URL`) con un
  código de intercambio opaco en la query string — nunca con los JWT reales,
  el navegador está en medio de un redirect y no puede leer un body JSON.
  Ante cualquier fallo, redirige igual pero con `?error=...` en vez de
  `?code=...` (mismo motivo: no hay forma de devolver un 400 JSON útil a un
  navegador que llegó acá vía redirect de Microsoft).
- `POST /exchange`: el frontend, ya en su propia página, canjea el código
  opaco por el par de JWT reales (en el body JSON de una respuesta normal).
- `POST /refresh`: rota el refresh token y devuelve un par nuevo.
- `POST /logout`: revoca la sesión de refresh (no invalida el access token
  en sí, ver `service.cerrar_sesion`).
- `GET /me`: devuelve el usuario autenticado a partir del `Authorization:
  Bearer <access_token>` de la request.

Nota — sin `NinjaAPI(auth=...)` global todavía: el resto de routers del
proyecto (catalogos, equipos, usuarios, comunidad, configuracion) siguen sin
protección de autenticación por ahora — conectar `auth.service.
usuario_desde_access_token` como guardia de esas rutas (vía un `HttpBearer`
propio de Django Ninja, p. ej. `NinjaAPI(auth=BearerAuth())` en
`config/urls.py`, o `@router.get(..., auth=BearerAuth())` por endpoint) es
trabajo futuro fuera del alcance de este módulo. Acá solo se construye y
deja lista la primitiva (`usuario_desde_access_token`); `GET /me` es su
único consumidor actual, implementado a mano leyendo el header
`Authorization` directamente en vez de un mecanismo de Ninja reutilizable,
justamente porque ese mecanismo reutilizable todavía no existe.
"""

import uuid
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponseRedirect
from ninja import Router, Schema

from auth import service

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class RefreshIn(Schema):
    refresh_token: str


class TokenPairOut(Schema):
    access_token: str
    refresh_token: str


class CodigoLoginIn(Schema):
    codigo: str


class UsuarioAutenticadoOut(Schema):
    id: uuid.UUID
    nombre: str
    email_institucional: str
    rol_id: uuid.UUID
    ubicacion_id: uuid.UUID


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.get("/login")
def login(request, login_hint: str | None = None):
    return HttpResponseRedirect(
        service.construir_url_autorizacion_microsoft(login_hint=login_hint)
    )


@router.get("/callback")
def callback(request, code: str, state: str):
    try:
        codigo = service.procesar_callback_microsoft(code, state)
    except ValueError:
        url = f"{settings.FRONTEND_POST_LOGIN_REDIRECT_URL}?{urlencode({'error': 'credenciales_invalidas'})}"
        return HttpResponseRedirect(url)
    url = f"{settings.FRONTEND_POST_LOGIN_REDIRECT_URL}?{urlencode({'code': codigo})}"
    return HttpResponseRedirect(url)


@router.post("/exchange", response={200: TokenPairOut, 400: dict})
def exchange(request, payload: CodigoLoginIn):
    try:
        access_token, refresh_token = service.intercambiar_codigo_login(payload.codigo)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, {"access_token": access_token, "refresh_token": refresh_token}


@router.post("/refresh", response={200: TokenPairOut, 400: dict})
def refresh(request, payload: RefreshIn):
    try:
        access_token, refresh_token = service.refrescar_sesion(payload.refresh_token)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, {"access_token": access_token, "refresh_token": refresh_token}


@router.post("/logout", response={204: None})
def logout(request, payload: RefreshIn):
    service.cerrar_sesion(payload.refresh_token)
    return 204, None


@router.get("/me", response={200: UsuarioAutenticadoOut, 401: dict})
def me(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return 401, {"detail": "No autenticado"}

    access_token = auth_header.removeprefix("Bearer ").strip()
    usuario = service.usuario_desde_access_token(access_token)
    if usuario is None:
        return 401, {"detail": "No autenticado"}
    return 200, usuario
