"""
controller.py — router de Django Ninja del módulo usuarios.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

Nota — `desactivar_usuario` recibe `usuario_actual_id` explícito en el
payload (no de sesión): todavía no existe el futuro módulo `auth` que
resolvería ese id a partir del JWT de Office 365 de la request. Cuando
exista, este endpoint pasa a tomarlo de `request` en vez del body.

Endpoints de escritura y su forma:

- `POST /` crea; `POST /vincular-oid-microsoft` vincula el oid en el
  primer login.
- `PATCH /{usuario_id}` es el partial update de los datos del usuario.
  Sigue el patrón ya establecido por catalogos (ver su
  `controller.py`): el schema `UsuarioPatch` declara todos sus campos
  opcionales y el endpoint llama `payload.model_dump(exclude_unset=True)`
  (no `.dict()`, deprecado en Pydantic v2) para distinguir "el cliente no
  envió este campo" de "lo envió en su valor por defecto". El chequeo de
  existencia (`service.obtener_usuario`) va ANTES de llamar a
  `service.actualizar_usuario`, devolviendo 404 ahí mismo: así el 404
  nunca depende de inspeccionar el mensaje del ValueError que el service
  lanza para cualquier otro caller que no precheckee, y el único
  ValueError que este endpoint puede recibir es una FK inválida
  (`rol_id`/`ubicacion_id`), mapeada a 400.
- `POST /{usuario_id}/desactivar` y `POST /{usuario_id}/reactivar` son
  las dos operaciones del ciclo de vida de `activo`, que por eso NO es un
  campo de `UsuarioPatch` (ver el docstring de ese schema). `reactivar`
  no lleva body ni `usuario_actual_id`: no tiene la autoprotección que sí
  tiene `desactivar` (ver `service.reactivar_usuario` para el porqué), y
  responde 404 si el usuario no existe.
- No hay `DELETE`: la desactivación es el soft delete de este dominio, y
  `llaves`/`prestamos`/`novedades` referencian a `usuario` con
  `on_delete=PROTECT`.
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


class UsuarioPatch(Schema):
    """Partial update de un Usuario: todos los campos opcionales, y el
    controller usa `model_dump(exclude_unset=True)` para distinguir "el
    cliente no envió este campo" de "lo envió en su valor por defecto"
    (mismo contrato que los `*Patch` de catalogos, ver su docstring de
    módulo).

    `activo` NO está declarado acá a propósito, no por olvido: activar y
    desactivar son operaciones propias con endpoints propios
    (`POST /{usuario_id}/desactivar` y `POST /{usuario_id}/reactivar`)
    porque la desactivación arrastra una regla de negocio propia — la
    autoprotección de `domain.validar_desactivacion`, que exige saber
    quién es el usuario actual. Aceptar `activo` como un campo más de
    este PATCH permitiría saltarse esa regla. Ninja descarta los campos
    no declarados, así que un `activo` enviado en el body simplemente se
    ignora.
    """

    nombre: str | None = None
    email_institucional: str | None = None
    rol_id: uuid.UUID | None = None
    ubicacion_id: uuid.UUID | None = None


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


@router.patch("/{usuario_id}", response={200: UsuarioOut, 404: dict, 400: dict})
def actualizar_usuario(request, usuario_id: uuid.UUID, payload: UsuarioPatch):
    if service.obtener_usuario(usuario_id) is None:
        return 404, {"detail": "Usuario no encontrado"}
    datos = payload.model_dump(exclude_unset=True)
    try:
        usuario = service.actualizar_usuario(usuario_id, **datos)
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


@router.post("/{usuario_id}/reactivar", response={200: UsuarioOut, 404: dict})
def reactivar_usuario(request, usuario_id: uuid.UUID):
    usuario = service.reactivar_usuario(usuario_id)
    if usuario is None:
        return 404, {"detail": "Usuario no encontrado"}
    return 200, usuario
