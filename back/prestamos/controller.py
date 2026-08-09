"""
controller.py — router de Django Ninja del módulo prestamos.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

`devolver_equipos` traduce las dos salidas "sin excepción" de
`service.devolver_equipos` (ver su docstring) a HTTP: `None` (préstamo
inexistente) -> 404, y deja el `ValueError` (referencia inexistente,
equipo que no pertenece al préstamo o ya devuelto) -> 400, mismo patrón
que `llaves.controller.devolver_llave`.
"""

import datetime
import uuid

from ninja import Router, Schema

from prestamos import service
from prestamos.model import EstadoDetalleEquipo, EstadoPrestamo

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class PrestamoOut(Schema):
    id: uuid.UUID
    solicitante_id: uuid.UUID
    usuario_prestamista_id: uuid.UUID
    ubicacion_id: uuid.UUID
    estado: EstadoPrestamo
    fecha_creacion: datetime.datetime


class DetallePrestamoOut(Schema):
    id: uuid.UUID
    prestamo_id: uuid.UUID
    equipo_id: uuid.UUID
    novedad_id: uuid.UUID | None
    estado_equipo: EstadoDetalleEquipo
    fecha_entrega: datetime.datetime
    fecha_devolucion: datetime.datetime | None


class DevolucionOut(Schema):
    id: uuid.UUID
    prestamo_id: uuid.UUID
    usuario_recibe_id: uuid.UUID
    ubicacion_id: uuid.UUID
    fecha: datetime.datetime
    es_completa: bool


class PrestamoIn(Schema):
    solicitante_id: uuid.UUID
    usuario_prestamista_id: uuid.UUID
    ubicacion_id: uuid.UUID
    equipo_ids: list[uuid.UUID]


class DevolverEquiposIn(Schema):
    usuario_recibe_id: uuid.UUID
    ubicacion_id: uuid.UUID
    equipo_ids: list[uuid.UUID]
    novedades_por_equipo: dict[uuid.UUID, uuid.UUID] | None = None


# ------------------------------------------------------------------
# Prestamo
# ------------------------------------------------------------------


@router.get("/", response=list[PrestamoOut])
def listar_prestamos(request):
    return service.listar_prestamos()


@router.get("/{prestamo_id}", response={200: PrestamoOut, 404: dict})
def obtener_prestamo(request, prestamo_id: uuid.UUID):
    prestamo = service.obtener_prestamo(prestamo_id)
    if prestamo is None:
        return 404, {"detail": "Préstamo no encontrado"}
    return 200, prestamo


@router.post("/", response={201: PrestamoOut, 400: dict})
def crear_prestamo(request, payload: PrestamoIn):
    try:
        prestamo = service.crear_prestamo(
            payload.solicitante_id,
            payload.usuario_prestamista_id,
            payload.ubicacion_id,
            payload.equipo_ids,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, prestamo


@router.get("/estado/{estado}", response=list[PrestamoOut])
def listar_prestamos_por_estado(request, estado: EstadoPrestamo):
    return service.listar_prestamos_por_estado(estado)


@router.get("/solicitante/{solicitante_id}", response=list[PrestamoOut])
def listar_prestamos_por_solicitante(request, solicitante_id: uuid.UUID):
    return service.listar_prestamos_por_solicitante(solicitante_id)


@router.get("/{prestamo_id}/detalles", response=list[DetallePrestamoOut])
def listar_detalles_por_prestamo(request, prestamo_id: uuid.UUID):
    return service.listar_detalles_por_prestamo(prestamo_id)


@router.get("/{prestamo_id}/devoluciones", response=list[DevolucionOut])
def listar_devoluciones_por_prestamo(request, prestamo_id: uuid.UUID):
    return service.listar_devoluciones_por_prestamo(prestamo_id)


@router.post(
    "/{prestamo_id}/devolver", response={200: DevolucionOut, 400: dict, 404: dict}
)
def devolver_equipos(request, prestamo_id: uuid.UUID, payload: DevolverEquiposIn):
    try:
        devolucion = service.devolver_equipos(
            prestamo_id,
            payload.usuario_recibe_id,
            payload.ubicacion_id,
            payload.equipo_ids,
            novedades_por_equipo=payload.novedades_por_equipo,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    if devolucion is None:
        return 404, {"detail": "Préstamo no encontrado"}
    return 200, devolucion
