"""
repository.py — única capa del módulo usuarios que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: usuario.
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
