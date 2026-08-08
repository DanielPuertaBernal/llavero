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
"""

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
