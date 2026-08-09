"""
service.py — API pública del módulo catalogos.

Es el ÚNICO punto de entrada que otros módulos (usuarios, comunidad,
programacion, llaves, prestamos...) deben usar para consumir catalogos —
nunca importan `model.py`/`repository.py` de este módulo directamente.

Casos de uso previstos para otros módulos (diseñado pensando en ese
consumo futuro):
- `usuarios` necesita `obtener_rol(id)` y `obtener_ubicacion(id)` para
  validar `rol_id`/`ubicacion_id` al crear un Usuario.
- `comunidad` necesita `obtener_tipo_persona(id)` para validar
  `tipo_persona_id` al crear un registro de Comunidad.
- `programacion`/`reservas`/`reservas_semestrales`/`llaves` necesitan
  `obtener_salon(id)` para validar `salon_id`.
- `configuracion` necesita `obtener_bloque`/`obtener_ubicacion` para
  validar sus propias referencias.

Convención de esta API: los `obtener_*` devuelven `None` cuando el id no
existe (no lanzan excepción) — la decisión de qué hacer ante "no existe"
(404, ValueError, etc.) queda del lado de quien llama, igual que
`dict.get()`. Los `crear_*` sí pueden lanzar `ValueError` cuando reciben
una referencia a otra entidad de catalogos que no existe (ver
`crear_salon`), para dar un error de negocio claro en vez de dejar
propagar el `IntegrityError` crudo de Postgres.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT de una sola tabla, ya atómico de por sí en
Django (autocommit por sentencia). Si en el futuro una operación de
catalogos requiere varios pasos de escritura coordinados, se envuelve
ahí explícitamente.

Convención de `actualizar_*`/`eliminar_*` (agregados para soportar
PATCH/DELETE completo antes de construir el frontend de Catalogos, ver
sdd/catalogos-editar-eliminar si existe diseño): a diferencia de
`obtener_*` (devuelve None si no existe), estas dos SÍ lanzan `ValueError`
cuando el id no existe — mismo criterio que `llaves.service.marcar_demora`
(el caller de un PATCH/DELETE ya conoce el id de un recurso que espera
que exista; un id ausente es un 404 de negocio, no un `None` a propagar).

Cada una de las 6 entidades de este módulo está referenciada por FKs
`on_delete=PROTECT` en algún otro módulo (`usuarios.Usuario.rol`/
`.ubicacion`, `comunidad.Comunidad.tipo_persona`, y `Salon`/`Salon.bloque`/
`Salon.tipo_silleteria` — ver `Salon` mismo, además de `reservas`/
`llaves`/`programacion`/`reservas_semestrales` apuntando a `Salon`). Por
eso Django ya lanza `django.db.models.deletion.ProtectedError` al intentar
un DELETE mientras exista una referencia viva — no se reimplementa ese
chequeo a mano (a diferencia del legacy, que lo hacía de forma asimétrica:
ver auditoría, `tipo_silleteria` no tenía ningún guard). `eliminar_*` acá
solo traduce ese `ProtectedError` a un `ValueError` con mensaje claro, para
que el controller pueda devolver un 400 de negocio en vez de un 500 crudo.
Las 6 entidades reciben el mismo tratamiento simétrico.
"""

from django.db.models import ProtectedError

from catalogos import repository

# ------------------------------------------------------------------
# Rol
# ------------------------------------------------------------------


def listar_roles():
    return repository.listar_roles()


def crear_rol(nombre: str):
    return repository.crear_rol(nombre)


def obtener_rol(rol_id):
    """Devuelve el Rol con ese id, o None si no existe."""
    return repository.obtener_rol_por_id(rol_id)


def actualizar_rol(rol_id, nombre: str | None = None):
    """Actualiza parcialmente el Rol con ese id (solo los campos
    provistos cambian, ver `repository.actualizar_rol`). Lanza ValueError
    si el id no existe."""
    if repository.obtener_rol_por_id(rol_id) is None:
        raise ValueError(f"No existe un rol con id {rol_id}")
    return repository.actualizar_rol(rol_id, nombre=nombre)


def eliminar_rol(rol_id):
    """Elimina el Rol con ese id. Lanza ValueError si el id no existe, o
    si el rol todavía está referenciado por otro registro (traduce el
    ProtectedError de Django, ver docstring del módulo)."""
    if repository.obtener_rol_por_id(rol_id) is None:
        raise ValueError(f"No existe un rol con id {rol_id}")
    try:
        repository.eliminar_rol(rol_id)
    except ProtectedError as exc:
        raise ValueError(
            f"No se puede eliminar el rol con id {rol_id}: está referenciado "
            "por otro registro"
        ) from exc


# ------------------------------------------------------------------
# TipoPersona
# ------------------------------------------------------------------


def listar_tipos_persona():
    return repository.listar_tipos_persona()


def crear_tipo_persona(nombre: str):
    return repository.crear_tipo_persona(nombre)


def obtener_tipo_persona(tipo_persona_id):
    """Devuelve el TipoPersona con ese id, o None si no existe."""
    return repository.obtener_tipo_persona_por_id(tipo_persona_id)


def actualizar_tipo_persona(tipo_persona_id, nombre: str | None = None):
    """Ver docstring de `actualizar_rol`."""
    if repository.obtener_tipo_persona_por_id(tipo_persona_id) is None:
        raise ValueError(f"No existe un tipo_persona con id {tipo_persona_id}")
    return repository.actualizar_tipo_persona(tipo_persona_id, nombre=nombre)


def eliminar_tipo_persona(tipo_persona_id):
    """Ver docstring de `eliminar_rol`."""
    if repository.obtener_tipo_persona_por_id(tipo_persona_id) is None:
        raise ValueError(f"No existe un tipo_persona con id {tipo_persona_id}")
    try:
        repository.eliminar_tipo_persona(tipo_persona_id)
    except ProtectedError as exc:
        raise ValueError(
            f"No se puede eliminar el tipo_persona con id {tipo_persona_id}: "
            "está referenciado por otro registro"
        ) from exc


# ------------------------------------------------------------------
# Ubicacion
# ------------------------------------------------------------------


def listar_ubicaciones():
    return repository.listar_ubicaciones()


def crear_ubicacion(
    nombre: str,
    permite_prestamo_llaves: bool = True,
    permite_devolucion_llaves: bool = True,
    permite_prestamo_equipos: bool = False,
):
    return repository.crear_ubicacion(
        nombre,
        permite_prestamo_llaves=permite_prestamo_llaves,
        permite_devolucion_llaves=permite_devolucion_llaves,
        permite_prestamo_equipos=permite_prestamo_equipos,
    )


def obtener_ubicacion(ubicacion_id):
    """Devuelve la Ubicacion con ese id, o None si no existe."""
    return repository.obtener_ubicacion_por_id(ubicacion_id)


def actualizar_ubicacion(
    ubicacion_id,
    nombre: str | None = None,
    permite_prestamo_llaves: bool | None = None,
    permite_devolucion_llaves: bool | None = None,
    permite_prestamo_equipos: bool | None = None,
):
    """Actualiza parcialmente la Ubicacion con ese id (solo los campos
    provistos cambian, ver `repository.actualizar_ubicacion`). Lanza
    ValueError si el id no existe."""
    if repository.obtener_ubicacion_por_id(ubicacion_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_id}")
    return repository.actualizar_ubicacion(
        ubicacion_id,
        nombre=nombre,
        permite_prestamo_llaves=permite_prestamo_llaves,
        permite_devolucion_llaves=permite_devolucion_llaves,
        permite_prestamo_equipos=permite_prestamo_equipos,
    )


def eliminar_ubicacion(ubicacion_id):
    """Ver docstring de `eliminar_rol`."""
    if repository.obtener_ubicacion_por_id(ubicacion_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_id}")
    try:
        repository.eliminar_ubicacion(ubicacion_id)
    except ProtectedError as exc:
        raise ValueError(
            f"No se puede eliminar la ubicacion con id {ubicacion_id}: está "
            "referenciada por otro registro"
        ) from exc


# ------------------------------------------------------------------
# Bloque
# ------------------------------------------------------------------


def listar_bloques():
    return repository.listar_bloques()


def crear_bloque(nombre: str):
    return repository.crear_bloque(nombre)


def obtener_bloque(bloque_id):
    """Devuelve el Bloque con ese id, o None si no existe."""
    return repository.obtener_bloque_por_id(bloque_id)


def actualizar_bloque(bloque_id, nombre: str | None = None):
    """Ver docstring de `actualizar_rol`."""
    if repository.obtener_bloque_por_id(bloque_id) is None:
        raise ValueError(f"No existe un bloque con id {bloque_id}")
    return repository.actualizar_bloque(bloque_id, nombre=nombre)


def eliminar_bloque(bloque_id):
    """Ver docstring de `eliminar_rol`. Referenciado por
    `Salon.bloque` — un salón vivo en ese bloque impide borrarlo."""
    if repository.obtener_bloque_por_id(bloque_id) is None:
        raise ValueError(f"No existe un bloque con id {bloque_id}")
    try:
        repository.eliminar_bloque(bloque_id)
    except ProtectedError as exc:
        raise ValueError(
            f"No se puede eliminar el bloque con id {bloque_id}: está "
            "referenciado por otro registro"
        ) from exc


# ------------------------------------------------------------------
# TipoSilleteria
# ------------------------------------------------------------------


def listar_tipos_silleteria():
    return repository.listar_tipos_silleteria()


def crear_tipo_silleteria(nombre: str):
    return repository.crear_tipo_silleteria(nombre)


def obtener_tipo_silleteria(tipo_silleteria_id):
    """Devuelve el TipoSilleteria con ese id, o None si no existe."""
    return repository.obtener_tipo_silleteria_por_id(tipo_silleteria_id)


def actualizar_tipo_silleteria(tipo_silleteria_id, nombre: str | None = None):
    """Ver docstring de `actualizar_rol`."""
    if repository.obtener_tipo_silleteria_por_id(tipo_silleteria_id) is None:
        raise ValueError(f"No existe un tipo_silleteria con id {tipo_silleteria_id}")
    return repository.actualizar_tipo_silleteria(tipo_silleteria_id, nombre=nombre)


def eliminar_tipo_silleteria(tipo_silleteria_id):
    """Ver docstring de `eliminar_rol`. Referenciado por
    `Salon.tipo_silleteria` — un salón vivo con ese tipo impide borrarlo."""
    if repository.obtener_tipo_silleteria_por_id(tipo_silleteria_id) is None:
        raise ValueError(f"No existe un tipo_silleteria con id {tipo_silleteria_id}")
    try:
        repository.eliminar_tipo_silleteria(tipo_silleteria_id)
    except ProtectedError as exc:
        raise ValueError(
            f"No se puede eliminar el tipo_silleteria con id {tipo_silleteria_id}: "
            "está referenciado por otro registro"
        ) from exc


# ------------------------------------------------------------------
# Salon
# ------------------------------------------------------------------


def listar_salones():
    return repository.listar_salones()


def listar_salones_por_bloque(bloque_id):
    return repository.listar_salones_por_bloque(bloque_id)


def crear_salon(
    nombre: str,
    bloque_id,
    tipo_silleteria_id,
    cantidad_sillas: int = 0,
    cantidad_mesas: int = 0,
):
    """Crea un Salon validando primero que el bloque y el tipo de
    silletería referenciados existan, para devolver un ValueError claro
    en vez de dejar propagar el IntegrityError crudo de Postgres.
    """
    if repository.obtener_bloque_por_id(bloque_id) is None:
        raise ValueError(f"No existe un bloque con id {bloque_id}")
    if repository.obtener_tipo_silleteria_por_id(tipo_silleteria_id) is None:
        raise ValueError(f"No existe un tipo_silleteria con id {tipo_silleteria_id}")
    return repository.crear_salon(
        nombre,
        bloque_id,
        tipo_silleteria_id,
        cantidad_sillas=cantidad_sillas,
        cantidad_mesas=cantidad_mesas,
    )


def obtener_salon(salon_id):
    """Devuelve el Salon con ese id, o None si no existe."""
    return repository.obtener_salon_por_id(salon_id)


def actualizar_salon(
    salon_id,
    nombre: str | None = None,
    bloque_id=None,
    tipo_silleteria_id=None,
    cantidad_sillas: int | None = None,
    cantidad_mesas: int | None = None,
):
    """Actualiza parcialmente el Salon con ese id (solo los campos
    provistos cambian, ver `repository.actualizar_salon`). Lanza
    ValueError si el id no existe, o si `bloque_id`/`tipo_silleteria_id`
    (cuando se provee alguno) no existen — mismo patrón de validación que
    `crear_salon`."""
    if repository.obtener_salon_por_id(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    if bloque_id is not None and repository.obtener_bloque_por_id(bloque_id) is None:
        raise ValueError(f"No existe un bloque con id {bloque_id}")
    if (
        tipo_silleteria_id is not None
        and repository.obtener_tipo_silleteria_por_id(tipo_silleteria_id) is None
    ):
        raise ValueError(f"No existe un tipo_silleteria con id {tipo_silleteria_id}")
    return repository.actualizar_salon(
        salon_id,
        nombre=nombre,
        bloque_id=bloque_id,
        tipo_silleteria_id=tipo_silleteria_id,
        cantidad_sillas=cantidad_sillas,
        cantidad_mesas=cantidad_mesas,
    )


def eliminar_salon(salon_id):
    """Ver docstring de `eliminar_rol`. Referenciado por ejemplo por
    `reservas.model.ReservaIndividual.salon`, `llaves.model.Llave.salon`,
    `programacion.model.Programacion.salon`,
    `reservas_semestrales.model.ReservaSemestral.salon`."""
    if repository.obtener_salon_por_id(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    try:
        repository.eliminar_salon(salon_id)
    except ProtectedError as exc:
        raise ValueError(
            f"No se puede eliminar el salon con id {salon_id}: está "
            "referenciado por otro registro"
        ) from exc
