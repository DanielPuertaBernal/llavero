"""
controller.py — router de Django Ninja del módulo usuarios.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

Nota — `desactivar_usuario` recibe `usuario_actual_id` explícito en el
payload (no de sesión): todavía no existe el futuro módulo `auth` que
resolvería ese id a partir del JWT de Office 365 de la request. Cuando
exista, este endpoint pasa a tomarlo de `request` en vez del body.
"""

import uuid

from ninja import Router, Schema

from usuarios import service

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class UsuarioOut(Schema):
    id: uuid.UUID
    nombre: str
    email_institucional: str
    oid_microsoft: str | None
    rol_id: uuid.UUID
    ubicacion_id: uuid.UUID
    activo: bool


class UsuarioIn(Schema):
    nombre: str
    email_institucional: str
    rol_id: uuid.UUID
    ubicacion_id: uuid.UUID
    activo: bool = True


class VincularOidMicrosoftIn(Schema):
    email_institucional: str
    oid_microsoft: str


class DesactivarUsuarioIn(Schema):
    usuario_actual_id: uuid.UUID


# ------------------------------------------------------------------
# Usuario
# ------------------------------------------------------------------


@router.get("/", response=list[UsuarioOut])
def listar_usuarios(request):
    return service.listar_usuarios()


@router.get("/{usuario_id}", response={200: UsuarioOut, 404: dict})
def obtener_usuario(request, usuario_id: uuid.UUID):
    usuario = service.obtener_usuario(usuario_id)
    if usuario is None:
        return 404, {"detail": "Usuario no encontrado"}
    return 200, usuario


@router.post("/", response={201: UsuarioOut, 400: dict})
def crear_usuario(request, payload: UsuarioIn):
    try:
        usuario = service.crear_usuario(
            payload.nombre,
            payload.email_institucional,
            payload.rol_id,
            payload.ubicacion_id,
            activo=payload.activo,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, usuario


@router.post("/vincular-oid-microsoft", response={200: UsuarioOut, 400: dict})
def vincular_oid_microsoft(request, payload: VincularOidMicrosoftIn):
    try:
        usuario = service.vincular_oid_microsoft(
            payload.email_institucional, payload.oid_microsoft
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, usuario


@router.post("/{usuario_id}/desactivar", response={200: UsuarioOut, 400: dict, 404: dict})
def desactivar_usuario(request, usuario_id: uuid.UUID, payload: DesactivarUsuarioIn):
    try:
        usuario = service.desactivar_usuario(usuario_id, payload.usuario_actual_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    if usuario is None:
        return 404, {"detail": "Usuario no encontrado"}
    return 200, usuario
