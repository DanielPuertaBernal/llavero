"""
repository.py — única capa del módulo monitores que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: monitor.

`listar_por_monitor_delegado` es la consulta equivalente al
`findByDocumentoMonitor` del legacy — la pieza que el futuro módulo
`llaves` necesita para resolver "¿esta persona es monitor delegado de
alguien?" durante la resolución de identidad por NFC (ver
`service.listar_monitorias_del_monitor`).
"""

from monitores.model import Monitor


def listar_monitores():
    return list(Monitor.objects.order_by("materia"))


def crear_monitor(
    docente_titular_id,
    monitor_delegado_id,
    materia: str,
    aula: str | None = None,
    dia: str | None = None,
    horario: str | None = None,
) -> Monitor:
    return Monitor.objects.create(
        docente_titular_id=docente_titular_id,
        monitor_delegado_id=monitor_delegado_id,
        materia=materia,
        aula=aula,
        dia=dia,
        horario=horario,
    )


def obtener_por_id(monitor_id):
    return Monitor.objects.filter(id=monitor_id).first()


def listar_por_monitor_delegado(monitor_delegado_id):
    """Todas las monitorías (activas o no) en las que esa persona es el
    monitor delegado. `service.listar_monitorias_del_monitor` filtra por
    `activo` antes de exponerlo — ver ese método para el contrato
    completo."""
    return list(
        Monitor.objects.filter(monitor_delegado_id=monitor_delegado_id).order_by(
            "materia"
        )
    )


def desactivar_monitor(monitor_id):
    """Pone activo=False en el Monitor con ese id, o devuelve None si no
    existe. Soft-delete: nunca un DELETE físico (ver model.py, nota de
    diseño sobre `activo`)."""
    monitor = Monitor.objects.filter(id=monitor_id).first()
    if monitor is None:
        return None
    monitor.activo = False
    monitor.save(update_fields=["activo"])
    return monitor
