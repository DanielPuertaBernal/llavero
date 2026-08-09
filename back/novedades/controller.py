"""
controller.py — router de Django Ninja del módulo novedades.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.
"""

import uuid

from ninja import Router, Schema

from novedades import service
from novedades.model import CategoriaNovedad, EstadoNovedad

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class NovedadOut(Schema):
    id: uuid.UUID
    categoria: CategoriaNovedad
    descripcion: str | None
    estado: EstadoNovedad
    solucion: str | None
    registrado_por_id: uuid.UUID


class NovedadIn(Schema):
    categoria: CategoriaNovedad
    registrado_por_id: uuid.UUID
    descripcion: str | None = None


class CerrarNovedadIn(Schema):
    solucion: str


# ------------------------------------------------------------------
# Novedad
# ------------------------------------------------------------------


@router.get("/", response=list[NovedadOut])
def listar_novedades(request):
    return service.listar_novedades()


@router.get("/{novedad_id}", response={200: NovedadOut, 404: dict})
def obtener_novedad(request, novedad_id: uuid.UUID):
    novedad = service.obtener_novedad(novedad_id)
    if novedad is None:
        return 404, {"detail": "Novedad no encontrada"}
    return 200, novedad


@router.post("/", response={201: NovedadOut, 400: dict})
def crear_novedad(request, payload: NovedadIn):
    try:
        novedad = service.crear_novedad(
            payload.categoria,
            payload.registrado_por_id,
            descripcion=payload.descripcion,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, novedad


@router.get("/estado/{estado}", response=list[NovedadOut])
def listar_novedades_por_estado(request, estado: EstadoNovedad):
    return service.listar_novedades_por_estado(estado)


@router.get("/categoria/{categoria}", response=list[NovedadOut])
def listar_novedades_por_categoria(request, categoria: CategoriaNovedad):
    return service.listar_novedades_por_categoria(categoria)


@router.post("/{novedad_id}/cerrar", response={200: NovedadOut, 400: dict, 404: dict})
def cerrar_novedad(request, novedad_id: uuid.UUID, payload: CerrarNovedadIn):
    try:
        novedad = service.cerrar_novedad(novedad_id, payload.solucion)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    if novedad is None:
        return 404, {"detail": "Novedad no encontrada"}
    return 200, novedad
