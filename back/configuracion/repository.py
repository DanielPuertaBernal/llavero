"""
repository.py — única capa del módulo configuracion que toca el ORM.

Métodos de intención para la única entidad que este módulo posee:
configuracion. A diferencia del resto de módulos, no hay `listar_*` ni
`obtener_*_por_id`: esta tabla opera como singleton de aplicación (ver
`service.py`), así que la única consulta de lectura con sentido es "traer
la fila de configuración vigente, si existe" — no "buscar una entre
varias por id".

Este archivo es intencionalmente "tonto": no valida nada de negocio (ni
la existencia de la ubicación referenciada, ni la invariante de fila
única) — eso vive en `service.py`. Acá solo hay operaciones directas de
ORM, igual convención que `catalogos.repository`/`usuarios.repository`/
`comunidad.repository`.
"""

from configuracion.model import Configuracion


def obtener_configuracion():
    """Devuelve la única fila de configuracion si existe, o None si la
    tabla todavía está vacía. `service.obtener_configuracion()` es quien
    resuelve el caso None (get-or-create) — ver ese docstring.
    """
    return Configuracion.objects.first()


def crear_configuracion(
    ubicacion_defecto_id,
    limite_antes_mora_minutos: int = 120,
    max_reintentos_recordatorio: int = 3,
    plantilla_recordatorio: str | None = None,
    limite_no_reclamada_minutos: int = 30,
) -> Configuracion:
    return Configuracion.objects.create(
        ubicacion_defecto_id=ubicacion_defecto_id,
        limite_antes_mora_minutos=limite_antes_mora_minutos,
        max_reintentos_recordatorio=max_reintentos_recordatorio,
        plantilla_recordatorio=plantilla_recordatorio,
        limite_no_reclamada_minutos=limite_no_reclamada_minutos,
    )


def actualizar_configuracion(
    configuracion_id,
    ubicacion_defecto_id,
    limite_antes_mora_minutos: int,
    max_reintentos_recordatorio: int,
    plantilla_recordatorio: str | None,
    limite_no_reclamada_minutos: int = 30,
):
    """Reemplaza todos los campos editables de la fila con ese id, o
    devuelve None si no existe. Mismo patrón que
    `comunidad.repository.actualizar_persona`.
    """
    configuracion = Configuracion.objects.filter(id=configuracion_id).first()
    if configuracion is None:
        return None
    configuracion.ubicacion_defecto_id = ubicacion_defecto_id
    configuracion.limite_antes_mora_minutos = limite_antes_mora_minutos
    configuracion.max_reintentos_recordatorio = max_reintentos_recordatorio
    configuracion.plantilla_recordatorio = plantilla_recordatorio
    configuracion.limite_no_reclamada_minutos = limite_no_reclamada_minutos
    configuracion.save(
        update_fields=[
            "ubicacion_defecto_id",
            "limite_antes_mora_minutos",
            "max_reintentos_recordatorio",
            "plantilla_recordatorio",
            "limite_no_reclamada_minutos",
        ]
    )
    return configuracion
