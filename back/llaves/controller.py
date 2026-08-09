"""
controller.py — router de Django Ninja del módulo llaves.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.
"""

import datetime
import uuid

from ninja import Router, Schema

from llaves import service
from llaves.model import EstadoLlave, OrigenLlave, TipoEntregaLlave

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class LlaveOut(Schema):
    id: uuid.UUID
    salon_id: uuid.UUID
    docente_titular_id: uuid.UUID
    reclamado_por_id: uuid.UUID
    origen: OrigenLlave
    tipo_entrega: TipoEntregaLlave
    tipo_devolucion: TipoEntregaLlave | None
    usuario_entrega_id: uuid.UUID
    usuario_recibe_id: uuid.UUID | None
    ubicacion_entrega_id: uuid.UUID
    ubicacion_devolucion_id: uuid.UUID | None
    novedad_id: uuid.UUID | None
    fecha_hora_entrega: datetime.datetime
    fecha_hora_devolucion: datetime.datetime | None
    estado: EstadoLlave


class LlaveIn(Schema):
    salon_id: uuid.UUID
    docente_titular_id: uuid.UUID
    reclamado_por_id: uuid.UUID
    origen: OrigenLlave
    tipo_entrega: TipoEntregaLlave
    usuario_entrega_id: uuid.UUID
    ubicacion_entrega_id: uuid.UUID


class DevolverLlaveIn(Schema):
    usuario_recibe_id: uuid.UUID
    ubicacion_devolucion_id: uuid.UUID
    tipo_devolucion: TipoEntregaLlave
    novedad_id: uuid.UUID | None = None


# ------------------------------------------------------------------
# Llave
# ------------------------------------------------------------------


@router.get("/", response=list[LlaveOut])
def listar_llaves(request):
    return service.listar_llaves()


@router.get("/{llave_id}", response={200: LlaveOut, 404: dict})
def obtener_llave(request, llave_id: uuid.UUID):
    llave = service.obtener_llave(llave_id)
    if llave is None:
        return 404, {"detail": "Llave no encontrada"}
    return 200, llave


@router.post("/", response={201: LlaveOut, 400: dict})
def crear_llave(request, payload: LlaveIn):
    try:
        llave = service.crear_llave(
            payload.salon_id,
            payload.docente_titular_id,
            payload.reclamado_por_id,
            payload.origen,
            payload.tipo_entrega,
            payload.usuario_entrega_id,
            payload.ubicacion_entrega_id,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, llave


@router.get("/estado/{estado}", response=list[LlaveOut])
def listar_llaves_por_estado(request, estado: EstadoLlave):
    return service.listar_llaves_por_estado(estado)


@router.get("/docente-titular/{docente_titular_id}", response=list[LlaveOut])
def listar_llaves_por_docente_titular(request, docente_titular_id: uuid.UUID):
    return service.listar_llaves_por_docente_titular(docente_titular_id)


@router.post("/{llave_id}/devolver", response={200: LlaveOut, 400: dict, 404: dict})
def devolver_llave(request, llave_id: uuid.UUID, payload: DevolverLlaveIn):
    try:
        llave = service.devolver_llave(
            llave_id,
            payload.usuario_recibe_id,
            payload.ubicacion_devolucion_id,
            payload.tipo_devolucion,
            novedad_id=payload.novedad_id,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    if llave is None:
        return 404, {"detail": "Llave no encontrada"}
    return 200, llave
