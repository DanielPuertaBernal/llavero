"""
controller.py — router de Django Ninja del módulo reservas.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

No se expone un endpoint HTTP para `completar_reserva`: esa transición
nunca la pide un caller humano directamente, siempre es un efecto
secundario de `llaves.service.crear_llave` al entregar la llave asociada
(ver Nota de diseño en `reservas/service.py`).
"""

import datetime
import uuid

from ninja import Router, Schema

from reservas import service
from reservas.model import EstadoReservaIndividual

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class ReservaIndividualOut(Schema):
    id: uuid.UUID
    salon_id: uuid.UUID
    solicitante_id: uuid.UUID
    fecha: datetime.date
    hora_inicio: datetime.time
    hora_fin: datetime.time
    motivo: str | None
    estado: EstadoReservaIndividual


class ReservaIndividualIn(Schema):
    salon_id: uuid.UUID
    solicitante_id: uuid.UUID
    fecha: datetime.date
    hora_inicio: datetime.time
    hora_fin: datetime.time
    motivo: str | None = None


# ------------------------------------------------------------------
# ReservaIndividual
# ------------------------------------------------------------------


@router.get("/", response=list[ReservaIndividualOut])
def listar_reservas(request):
    return service.listar_reservas()


@router.get("/{reserva_id}", response={200: ReservaIndividualOut, 404: dict})
def obtener_reserva(request, reserva_id: uuid.UUID):
    reserva = service.obtener_reserva(reserva_id)
    if reserva is None:
        return 404, {"detail": "Reserva no encontrada"}
    return 200, reserva


@router.post("/", response={201: ReservaIndividualOut, 400: dict})
def crear_reserva(request, payload: ReservaIndividualIn):
    try:
        reserva = service.crear_reserva(
            payload.salon_id,
            payload.solicitante_id,
            payload.fecha,
            payload.hora_inicio,
            payload.hora_fin,
            motivo=payload.motivo,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, reserva


@router.get("/solicitante/{solicitante_id}", response=list[ReservaIndividualOut])
def listar_reservas_por_solicitante(request, solicitante_id: uuid.UUID):
    return service.listar_reservas_por_solicitante(solicitante_id)


@router.post("/{reserva_id}/cancelar", response={200: ReservaIndividualOut, 400: dict})
def cancelar_reserva(request, reserva_id: uuid.UUID):
    try:
        reserva = service.cancelar_reserva(reserva_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, reserva
