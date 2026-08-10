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
- `crear_usuario` y `actualizar_usuario` lanzan `ValueError` cuando
  `rol_id`/`ubicacion_id` no existen en catalogos, igual patrón que
  `catalogos.service.crear_salon` con `bloque_id`/`tipo_silleteria_id` —
  con la diferencia de que acá la validación es contra otro módulo
  (`catalogos.service`), no contra el propio `repository`.
  `actualizar_usuario` valida esas FKs solo cuando vienen provistas, y
  además lanza `ValueError` si el `usuario_id` no existe (mismo criterio
  que `catalogos.service.actualizar_*`: quien hace un PATCH ya conoce el
  id del recurso que espera que exista).
- Los choques de unicidad (`email_institucional`, `oid_microsoft`) NO se
  validan en Python en ninguna operación: se deja propagar el
  IntegrityError crudo de Postgres, convención deliberada y consistente
  del proyecto (ver `repository.vincular_oid_microsoft` y
  `equipos.service`, `codigo_inventario`/`codigo_barras`).

Ciclo de vida de `activo` — tres operaciones, no un campo editable:
`desactivar_usuario` (con autoprotección: nadie puede desactivarse a sí
mismo, ver `domain.validar_desactivacion`) y `reactivar_usuario` (sin
autoprotección, ver su docstring). `activo` no es parte de
`actualizar_usuario` a propósito, para que un PATCH no pueda saltarse esa
autoprotección. La desactivación es el "soft delete" de este dominio: no
existe una operación de borrado físico, porque `llaves`, `prestamos` y
`novedades` referencian a `usuario` con `on_delete=PROTECT`.

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


def actualizar_usuario(
    usuario_id,
    nombre=None,
    email_institucional=None,
    rol_id=None,
    ubicacion_id=None,
):
    """Actualiza parcialmente el Usuario con ese id: solo los campos
    provistos (distintos de None) cambian, ver
    `repository.actualizar_usuario`.

    A diferencia de los `obtener_*` (que devuelven None), lanza
    `ValueError` cuando el id no existe — mismo criterio que
    `catalogos.service.actualizar_*`: quien hace un PATCH ya conoce el id
    de un recurso que espera que exista, así que un id ausente es un error
    de negocio, no un None a propagar.

    Valida `rol_id`/`ubicacion_id` contra `catalogos.service` SOLO cuando
    vienen provistos, por el mismo motivo que `crear_usuario`: devolver un
    ValueError claro en vez de dejar propagar el IntegrityError crudo de
    Postgres. Un patch que no toca esas FKs no las revalida.

    NO valida la unicidad de `email_institucional` en Python: se deja
    propagar el IntegrityError crudo de Postgres si el email ya está en
    uso (columna UNIQUE). Es la convención deliberada y consistente del
    proyecto para choques de unicidad — ver el docstring de
    `repository.vincular_oid_microsoft` y `equipos.service`
    (`codigo_inventario`/`codigo_barras`). Chequearlo acá además abriría
    una ventana TOCTOU que el constraint de la base ya cierra.

    `activo` no es parte de esta firma a propósito: activación y
    desactivación son operaciones propias, con endpoints y reglas propias
    (`desactivar_usuario` arrastra la autoprotección de
    `domain.validar_desactivacion`; `reactivar_usuario` no). Exponerlas
    también como un campo más del partial update permitiría saltarse esa
    autoprotección con un PATCH.
    """
    if repository.obtener_usuario_por_id(usuario_id) is None:
        raise ValueError(f"No existe un usuario con id {usuario_id}")
    if rol_id is not None and catalogos_service.obtener_rol(rol_id) is None:
        raise ValueError(f"No existe un rol con id {rol_id}")
    if ubicacion_id is not None and catalogos_service.obtener_ubicacion(ubicacion_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_id}")
    return repository.actualizar_usuario(
        usuario_id,
        nombre=nombre,
        email_institucional=email_institucional,
        rol_id=rol_id,
        ubicacion_id=ubicacion_id,
    )


def desactivar_usuario(usuario_objetivo_id, usuario_actual_id):
    """Desactiva al usuario objetivo, validando primero la autoprotección
    de desactivación (domain.validar_desactivacion): un usuario no puede
    desactivarse a sí mismo — lanza AutodesactivacionError si lo intenta.

    Devuelve None si el usuario objetivo no existe (mismo contrato que
    obtener_*), o el Usuario ya actualizado.
    """
    domain.validar_desactivacion(usuario_objetivo_id, usuario_actual_id)
    return repository.desactivar_usuario(usuario_objetivo_id)


def reactivar_usuario(usuario_id):
    """Reactiva al usuario (activo=True), deshaciendo una desactivación.

    Devuelve None si el usuario no existe (mismo contrato que
    `desactivar_usuario` y los `obtener_*`), o el Usuario ya actualizado.
    Es idempotente: reactivar a alguien que ya está activo es un no-op que
    devuelve el usuario, no un error — el resultado pedido ya se cumple.

    No recibe `usuario_actual_id` ni valida autoprotección, a diferencia
    de `desactivar_usuario`. La autoprotección existe para que un operador
    no se deje a sí mismo fuera del sistema, y reactivarse a sí mismo no
    es alcanzable: un usuario desactivado no puede autenticarse en primer
    lugar — `auth.service.usuario_desde_access_token` revalida `activo`
    contra la base de datos en cada request y devuelve None si está
    inactivo, así que nunca llega a invocar este endpoint. El caso
    simétrico ("reactivarme a mí mismo") es entonces o bien imposible, o
    bien inofensivo (un usuario activo reactivándose es el no-op de
    arriba).
    """
    return repository.reactivar_usuario(usuario_id)
