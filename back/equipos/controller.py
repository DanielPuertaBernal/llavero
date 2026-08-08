"""
controller.py — router de Django Ninja del módulo equipos.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

Nota de nomenclatura (ver AulaSync/analisis/backend/equipos.md): el
sistema legacy monta esta funcionalidad en `/api/inventario` aunque el
modelo interno, la app y la colección se llaman "equipo(s)" en todo el
código ("probablemente decisión de producto: el usuario final ve
inventario"). Acá se mantiene el nombre de módulo/app Django `equipos`
(consistente con el resto del backend) y se monta el router en
`/api/equipos`, sin imitar esa divergencia legacy — no hay requisito de
producto en este proyecto que la justifique. Si en el futuro se decide
paridad de producto con el nombre "inventario" de cara al usuario, basta
con cambiar el prefijo en config/urls.py; no afecta service/repository.
"""

import uuid

from ninja import Router, Schema

from equipos import service
from equipos.model import EstadoEquipo

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class EquipoOut(Schema):
    id: uuid.UUID
    nombre: str
    marca: str | None
    codigo_inventario: str
    codigo_barras: str | None
    estado: EstadoEquipo


class EquipoIn(Schema):
    nombre: str
    codigo_inventario: str
    marca: str | None = None
    codigo_barras: str | None = None
    estado: EstadoEquipo = EstadoEquipo.ACTIVO


# ------------------------------------------------------------------
# Equipo
# ------------------------------------------------------------------


@router.get("/", response=list[EquipoOut])
def listar_equipos(request):
    return service.listar_equipos()


@router.get("/{equipo_id}", response={200: EquipoOut, 404: dict})
def obtener_equipo(request, equipo_id: uuid.UUID):
    equipo = service.obtener_equipo(equipo_id)
    if equipo is None:
        return 404, {"detail": "Equipo no encontrado"}
    return 200, equipo


@router.post("/", response={201: EquipoOut})
def crear_equipo(request, payload: EquipoIn):
    equipo = service.crear_equipo(
        payload.nombre,
        payload.codigo_inventario,
        marca=payload.marca,
        codigo_barras=payload.codigo_barras,
        estado=payload.estado,
    )
    return 201, equipo
