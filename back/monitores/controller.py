"""
controller.py — router de Django Ninja del módulo monitores.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.
"""

import uuid

from ninja import Router, Schema

from monitores import service
from monitores.model import DiaSemana

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class MonitorOut(Schema):
    id: uuid.UUID
    docente_titular_id: uuid.UUID
    monitor_delegado_id: uuid.UUID
    materia: str
    aula: str | None
    dia: DiaSemana | None
    horario: str | None
    activo: bool


class MonitorIn(Schema):
    docente_titular_id: uuid.UUID
    monitor_delegado_id: uuid.UUID
    materia: str
    aula: str | None = None
    dia: DiaSemana | None = None
    horario: str | None = None


# ------------------------------------------------------------------
# Monitor
# ------------------------------------------------------------------


@router.get("/", response=list[MonitorOut])
def listar_monitores(request):
    return service.listar_monitores()


@router.get("/{monitor_id}", response={200: MonitorOut, 404: dict})
def obtener_monitor(request, monitor_id: uuid.UUID):
    monitor = service.obtener_monitor(monitor_id)
    if monitor is None:
        return 404, {"detail": "Monitor no encontrado"}
    return 200, monitor


@router.post("/", response={201: MonitorOut, 400: dict})
def crear_monitor(request, payload: MonitorIn):
    try:
        monitor = service.crear_monitor(
            payload.docente_titular_id,
            payload.monitor_delegado_id,
            payload.materia,
            aula=payload.aula,
            dia=payload.dia,
            horario=payload.horario,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, monitor


@router.post("/{monitor_id}/desactivar", response={200: MonitorOut, 404: dict})
def desactivar_monitor(request, monitor_id: uuid.UUID):
    monitor = service.desactivar_monitor(monitor_id)
    if monitor is None:
        return 404, {"detail": "Monitor no encontrado"}
    return 200, monitor


@router.get(
    "/monitor-delegado/{monitor_delegado_id}/monitorias",
    response=list[MonitorOut],
)
def listar_monitorias_del_monitor(request, monitor_delegado_id: uuid.UUID):
    return service.listar_monitorias_del_monitor(monitor_delegado_id)


@router.get(
    "/{monitor_id}/clases-docente-titular",
    response={200: list[dict], 404: dict},
)
def clases_del_docente_titular(request, monitor_id: uuid.UUID):
    clases = service.clases_del_docente_titular(monitor_id)
    if clases is None:
        return 404, {"detail": "Monitor no encontrado"}
    return 200, [
        {
            "id": str(c.id),
            "salon_id": str(c.salon_id),
            "semestre_id": str(c.semestre_id),
            "dia": c.dia,
            "hora_inicio": c.hora_inicio.isoformat(),
            "hora_fin": c.hora_fin.isoformat(),
            "materia": c.materia,
        }
        for c in clases
    ]
