"""
repository.py — única capa del módulo usuarios que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: usuario.

Escrituras disponibles y por qué están separadas:
- `crear_usuario`: el INSERT.
- `actualizar_usuario`: partial update de los datos del usuario
  (`nombre`, `email_institucional`, `rol_id`, `ubicacion_id`), escribiendo
  vía `update_fields` solo los campos provistos. Misma forma que
  `catalogos.repository.actualizar_*`.
- `vincular_oid_microsoft`: UPDATE de un solo campo, propio del primer
  login de Office 365.
- `desactivar_usuario` / `reactivar_usuario`: UPDATE de un solo campo
  (`activo`), uno por sentido. `activo` deliberadamente NO es parte de
  `actualizar_usuario`: la desactivación arrastra una regla de negocio
  propia (la autoprotección de `domain.validar_desactivacion`) que un
  partial update genérico se saltaría, y la baja lógica es el "soft
  delete" de este dominio — no hay hard delete de usuario, porque
  `llaves`, `prestamos` y `novedades` lo referencian con
  `on_delete=PROTECT`.

Los choques de unicidad (`email_institucional`, `oid_microsoft`) no se
validan en Python en ninguna de estas funciones: se deja propagar el
IntegrityError crudo de Postgres, convención deliberada y consistente del
proyecto (ver `vincular_oid_microsoft` acá abajo y `equipos.service`).
"""

from usuarios.model import Usuario


def listar_usuarios():
    return list(Usuario.objects.order_by("nombre"))


def crear_usuario(
    nombre: str,
    email_institucional: str,
    rol_id,
    ubicacion_id,
    activo: bool = True,
) -> Usuario:
    return Usuario.objects.create(
        nombre=nombre,
        email_institucional=email_institucional,
        rol_id=rol_id,
        ubicacion_id=ubicacion_id,
        activo=activo,
    )


def obtener_usuario_por_id(usuario_id):
    return Usuario.objects.filter(id=usuario_id).first()


def obtener_usuario_por_email(email_institucional: str):
    return Usuario.objects.filter(email_institucional=email_institucional).first()


def vincular_oid_microsoft(usuario_id, oid_microsoft: str):
    """Setea oid_microsoft en el Usuario con ese id, o devuelve None si no
    existe. No valida unicidad en Python: se deja propagar el
    IntegrityError crudo de Postgres si el oid ya está en uso (columna
    UNIQUE), igual convención que el resto de choques de unicidad del
    proyecto (ver equipos.service, codigo_inventario/codigo_barras).
    """
    usuario = Usuario.objects.filter(id=usuario_id).first()
    if usuario is None:
        return None
    usuario.oid_microsoft = oid_microsoft
    usuario.save(update_fields=["oid_microsoft"])
    return usuario


def actualizar_usuario(
    usuario_id,
    nombre: str | None = None,
    email_institucional: str | None = None,
    rol_id=None,
    ubicacion_id=None,
):
    """Actualiza solo los campos provistos (distintos de None) del Usuario
    con ese id, o devuelve None si no existe. `None` significa "no cambiar
    este campo" — igual convención que `catalogos.repository.actualizar_*`
    (ver docstring de `actualizar_ubicacion` allá). Reusar `None` como
    sentinel de "no provisto" es seguro acá porque ninguno de estos 4
    campos es nullable en el DDL: `nombre`/`email_institucional` son NOT
    NULL y las dos FKs también (el único campo nullable de la tabla es
    `oid_microsoft`, que no se edita por esta vía sino por
    `vincular_oid_microsoft`).

    `activo` NO está en esta firma a propósito: activar y desactivar
    tienen sus propios métodos (`reactivar_usuario`/`desactivar_usuario`)
    porque la desactivación arrastra una regla de negocio propia (la
    autoprotección de `domain.validar_desactivacion`) que un partial
    update genérico se saltaría.

    No valida las FKs `rol_id`/`ubicacion_id` ni la unicidad de
    `email_institucional` — esa validación vive en
    `service.actualizar_usuario`, misma separación de responsabilidades
    que `crear_usuario`/`service.crear_usuario`.
    """
    usuario = Usuario.objects.filter(id=usuario_id).first()
    if usuario is None:
        return None
    campos = []
    if nombre is not None:
        usuario.nombre = nombre
        campos.append("nombre")
    if email_institucional is not None:
        usuario.email_institucional = email_institucional
        campos.append("email_institucional")
    if rol_id is not None:
        usuario.rol_id = rol_id
        campos.append("rol_id")
    if ubicacion_id is not None:
        usuario.ubicacion_id = ubicacion_id
        campos.append("ubicacion_id")
    if campos:
        usuario.save(update_fields=campos)
    return usuario


def desactivar_usuario(usuario_id):
    """Pone activo=False en el Usuario con ese id, o devuelve None si no
    existe. La autoprotección (un usuario no puede desactivarse a sí
    mismo) se valida en domain.py/service.py, antes de llegar acá — este
    método asume que esa decisión ya se tomó.
    """
    usuario = Usuario.objects.filter(id=usuario_id).first()
    if usuario is None:
        return None
    usuario.activo = False
    usuario.save(update_fields=["activo"])
    return usuario


def reactivar_usuario(usuario_id):
    """Pone activo=True en el Usuario con ese id, o devuelve None si no
    existe — el espejo exacto de `desactivar_usuario`, mismo UPDATE de un
    solo campo vía update_fields.

    Es idempotente: reactivar a un usuario que ya estaba activo lo deja
    activo y lo devuelve, no es un error. A diferencia de
    `desactivar_usuario`, no hay ninguna regla de autoprotección detrás
    (ver `service.reactivar_usuario` para el porqué).
    """
    usuario = Usuario.objects.filter(id=usuario_id).first()
    if usuario is None:
        return None
    usuario.activo = True
    usuario.save(update_fields=["activo"])
    return usuario
