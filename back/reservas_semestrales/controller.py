"""
controller.py — router de Django Ninja del módulo reservas_semestrales.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

`cancelar_grupo` traduce las dos salidas "sin excepción" de
`service.cancelar_grupo` (ver su docstring) a HTTP: `None` (grupo
inexistente) -> 404, y deja el `ValueError` (grupo cargado
institucionalmente) -> 400, mismo patrón que el resto de endpoints de
transición/cancelación del proyecto (ver `reservas/controller.
cancelar_reserva`).
"""

import datetime
import uuid

from ninja import Router, Schema

from reservas_semestrales import service
from reservas_semestrales.model import DiaSemana

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class ReservaSemestralOut(Schema):
    id: uuid.UUID
    salon_id: uuid.UUID
    solicitante_id: uuid.UUID
    semestre_id: uuid.UUID
    dia: DiaSemana
    hora_inicio: datetime.time
    hora_fin: datetime.time
    grupo_id: uuid.UUID
    creado_manualmente: bool


class FranjaIn(Schema):
    dia: DiaSemana
    hora_inicio: datetime.time
    hora_fin: datetime.time


class GrupoReservaSemestralIn(Schema):
    salon_id: uuid.UUID
    solicitante_id: uuid.UUID
    semestre_id: uuid.UUID
    franjas: list[FranjaIn]
    creado_manualmente: bool = True


# ------------------------------------------------------------------
# ReservaSemestral
# ------------------------------------------------------------------


@router.get("/", response=list[ReservaSemestralOut])
def listar_reservas_semestrales(request):
    return service.listar_reservas_semestrales()


@router.get("/{reserva_id}", response={200: ReservaSemestralOut, 404: dict})
def obtener_reserva_semestral(request, reserva_id: uuid.UUID):
    reserva = service.obtener_por_id(reserva_id)
    if reserva is None:
        return 404, {"detail": "Reserva semestral no encontrada"}
    return 200, reserva


@router.get("/grupo/{grupo_id}", response=list[ReservaSemestralOut])
def listar_por_grupo(request, grupo_id: uuid.UUID):
    return service.listar_por_grupo(grupo_id)


@router.post("/", response={201: list[ReservaSemestralOut], 400: dict})
def crear_grupo_reservas_semestrales(request, payload: GrupoReservaSemestralIn):
    try:
        creadas = service.crear_grupo_reservas_semestrales(
            payload.salon_id,
            payload.solicitante_id,
            payload.semestre_id,
            [
                {"dia": franja.dia, "hora_inicio": franja.hora_inicio, "hora_fin": franja.hora_fin}
                for franja in payload.franjas
            ],
            creado_manualmente=payload.creado_manualmente,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, creadas


@router.post("/grupo/{grupo_id}/cancelar", response={200: dict, 400: dict, 404: dict})
def cancelar_grupo(request, grupo_id: uuid.UUID):
    try:
        eliminadas = service.cancelar_grupo(grupo_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    if eliminadas is None:
        return 404, {"detail": "No existe un grupo de reservas semestrales con ese id"}
    return 200, {"eliminadas": eliminadas}
