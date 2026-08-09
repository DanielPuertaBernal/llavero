"""
service.py — API pública del módulo usuarios.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
usuarios — nunca importan `model.py`/`repository.py` de este módulo
directamente. Simétricamente, este módulo consume `catalogos`
exclusivamente vía `catalogos.service` (nunca `catalogos.model`/
`catalogos.repository`), la misma regla dura aplicada en la otra
dirección.

Convención de esta API, igual que `catalogos.service`:
- Los `obtener_*` devuelven `None` cuando el id/email no existe (no
  lanzan excepción) — la decisión de qué hacer ante "no existe" (404,
  ValueError, etc.) queda del lado de quien llama.
- `crear_usuario` lanza `ValueError` cuando `rol_id`/`ubicacion_id` no
  existen en catalogos, igual patrón que `catalogos.service.crear_salon`
  con `bloque_id`/`tipo_silleteria_id` — con la diferencia de que acá la
  validación es contra otro módulo (`catalogos.service`), no contra el
  propio `repository`.

Autenticación (Office 365/Entra ID): el flujo decidido
(AulaSync/analisis/estrategia-migracion/backend.md, sección
Autenticación) es que un admin precrea el Usuario (con `oid_microsoft`
en null) y el login de Office 365 solo lo vincula por
`email_institucional` en su primer ingreso. Ese vínculo es lo que expone
`vincular_oid_microsoft` acá — validar el JWT de Microsoft y todo el
flujo HTTP de OAuth es responsabilidad del futuro módulo `auth`, que
llamará a esta función una vez ya haya verificado la identidad.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT/UPDATE de una sola tabla, ya atómico de por
sí en Django (autocommit por sentencia).
"""

from catalogos import service as catalogos_service
from usuarios import domain, repository


def listar_usuarios():
    return repository.listar_usuarios()


def crear_usuario(
    nombre: str,
    email_institucional: str,
    rol_id,
    ubicacion_id,
    activo: bool = True,
):
    """Crea un Usuario validando primero que el rol y la ubicación
    referenciados existan en catalogos, para devolver un ValueError claro
    en vez de dejar propagar el IntegrityError crudo de Postgres.
    """
    if catalogos_service.obtener_rol(rol_id) is None:
        raise ValueError(f"No existe un rol con id {rol_id}")
    if catalogos_service.obtener_ubicacion(ubicacion_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_id}")
    return repository.crear_usuario(
        nombre, email_institucional, rol_id, ubicacion_id, activo=activo
    )


def obtener_usuario(usuario_id):
    """Devuelve el Usuario con ese id, o None si no existe."""
    return repository.obtener_usuario_por_id(usuario_id)


def obtener_usuario_por_email(email_institucional: str):
    """Devuelve el Usuario con ese email institucional, o None si no
    existe."""
    return repository.obtener_usuario_por_email(email_institucional)


def vincular_oid_microsoft(email_institucional: str, oid_microsoft: str):
    """Vincula el oid_microsoft de Office 365/Entra ID a un Usuario ya
    precreado, en su primer login.

    Lanza ValueError si no existe un Usuario precreado con ese email
    institucional — el flujo decidido exige que un admin lo cree antes de
    que la persona pueda loguearse por primera vez; no se crea el
    Usuario "sobre la marcha" a partir del login de Office 365.
    """
    usuario = repository.obtener_usuario_por_email(email_institucional)
    if usuario is None:
        raise ValueError(
            f"No existe un usuario precreado con email institucional {email_institucional}"
        )
    return repository.vincular_oid_microsoft(usuario.id, oid_microsoft)


def desactivar_usuario(usuario_objetivo_id, usuario_actual_id):
    """Desactiva al usuario objetivo, validando primero la autoprotección
    de desactivación (domain.validar_desactivacion): un usuario no puede
    desactivarse a sí mismo — lanza AutodesactivacionError si lo intenta.

    Devuelve None si el usuario objetivo no existe (mismo contrato que
    obtener_*), o el Usuario ya actualizado.
    """
    domain.validar_desactivacion(usuario_objetivo_id, usuario_actual_id)
    return repository.desactivar_usuario(usuario_objetivo_id)
