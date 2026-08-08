"""
controller.py — router de Django Ninja del módulo programacion.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.
"""

import datetime
import uuid

from ninja import Router, Schema

from programacion import service
from programacion.model import DiaSemana

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class SemestreOut(Schema):
    id: uuid.UUID
    codigo: str
    fecha_inicio: datetime.date
    fecha_fin: datetime.date


class SemestreIn(Schema):
    codigo: str
    fecha_inicio: datetime.date
    fecha_fin: datetime.date


class ProgramacionOut(Schema):
    id: uuid.UUID
    salon_id: uuid.UUID
    docente_id: uuid.UUID
    semestre_id: uuid.UUID
    dia: DiaSemana
    hora_inicio: datetime.time
    hora_fin: datetime.time
    materia: str


class ProgramacionIn(Schema):
    salon_id: uuid.UUID
    docente_id: uuid.UUID
    semestre_id: uuid.UUID
    dia: DiaSemana
    hora_inicio: datetime.time
    hora_fin: datetime.time
    materia: str


# ------------------------------------------------------------------
# Semestre
# ------------------------------------------------------------------


@router.get("/semestres", response=list[SemestreOut])
def listar_semestres(request):
    return service.listar_semestres()


@router.post("/semestres", response={201: SemestreOut})
def crear_semestre(request, payload: SemestreIn):
    semestre = service.crear_semestre(
        payload.codigo, payload.fecha_inicio, payload.fecha_fin
    )
    return 201, semestre


# ------------------------------------------------------------------
# Programacion
# ------------------------------------------------------------------


@router.get("/", response=list[ProgramacionOut])
def listar_programaciones(request):
    return service.listar_programaciones()


@router.get("/{programacion_id}", response={200: ProgramacionOut, 404: dict})
def obtener_programacion(request, programacion_id: uuid.UUID):
    programacion = service.obtener_programacion(programacion_id)
    if programacion is None:
        return 404, {"detail": "Programación no encontrada"}
    return 200, programacion


@router.post("/", response={201: ProgramacionOut, 400: dict})
def crear_programacion(request, payload: ProgramacionIn):
    try:
        programacion = service.crear_programacion(
            payload.salon_id,
            payload.docente_id,
            payload.semestre_id,
            payload.dia,
            payload.hora_inicio,
            payload.hora_fin,
            payload.materia,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, programacion
