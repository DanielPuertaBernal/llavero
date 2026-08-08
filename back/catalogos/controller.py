"""
controller.py — router de Django Ninja del módulo catalogos.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.
"""

import uuid

from ninja import Router, Schema

from catalogos import service

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class RolOut(Schema):
    id: uuid.UUID
    nombre: str


class RolIn(Schema):
    nombre: str


class TipoPersonaOut(Schema):
    id: uuid.UUID
    nombre: str


class TipoPersonaIn(Schema):
    nombre: str


class UbicacionOut(Schema):
    id: uuid.UUID
    nombre: str
    permite_prestamo_llaves: bool
    permite_devolucion_llaves: bool
    permite_prestamo_equipos: bool


class UbicacionIn(Schema):
    nombre: str
    permite_prestamo_llaves: bool = True
    permite_devolucion_llaves: bool = True
    permite_prestamo_equipos: bool = False


class BloqueOut(Schema):
    id: uuid.UUID
    nombre: str


class BloqueIn(Schema):
    nombre: str


class TipoSilleteriaOut(Schema):
    id: uuid.UUID
    nombre: str


class TipoSilleteriaIn(Schema):
    nombre: str


class SalonOut(Schema):
    id: uuid.UUID
    nombre: str
    bloque_id: uuid.UUID
    tipo_silleteria_id: uuid.UUID
    cantidad_sillas: int
    cantidad_mesas: int


class SalonIn(Schema):
    nombre: str
    bloque_id: uuid.UUID
    tipo_silleteria_id: uuid.UUID
    cantidad_sillas: int = 0
    cantidad_mesas: int = 0


# ------------------------------------------------------------------
# Rol
# ------------------------------------------------------------------


@router.get("/roles", response=list[RolOut])
def listar_roles(request):
    return service.listar_roles()


@router.post("/roles", response={201: RolOut})
def crear_rol(request, payload: RolIn):
    return 201, service.crear_rol(payload.nombre)


# ------------------------------------------------------------------
# TipoPersona
# ------------------------------------------------------------------


@router.get("/tipos-persona", response=list[TipoPersonaOut])
def listar_tipos_persona(request):
    return service.listar_tipos_persona()


@router.post("/tipos-persona", response={201: TipoPersonaOut})
def crear_tipo_persona(request, payload: TipoPersonaIn):
    return 201, service.crear_tipo_persona(payload.nombre)


# ------------------------------------------------------------------
# Ubicacion
# ------------------------------------------------------------------


@router.get("/ubicaciones", response=list[UbicacionOut])
def listar_ubicaciones(request):
    return service.listar_ubicaciones()


@router.post("/ubicaciones", response={201: UbicacionOut})
def crear_ubicacion(request, payload: UbicacionIn):
    return 201, service.crear_ubicacion(
        payload.nombre,
        permite_prestamo_llaves=payload.permite_prestamo_llaves,
        permite_devolucion_llaves=payload.permite_devolucion_llaves,
        permite_prestamo_equipos=payload.permite_prestamo_equipos,
    )


# ------------------------------------------------------------------
# Bloque
# ------------------------------------------------------------------


@router.get("/bloques", response=list[BloqueOut])
def listar_bloques(request):
    return service.listar_bloques()


@router.post("/bloques", response={201: BloqueOut})
def crear_bloque(request, payload: BloqueIn):
    return 201, service.crear_bloque(payload.nombre)


# ------------------------------------------------------------------
# TipoSilleteria
# ------------------------------------------------------------------


@router.get("/tipos-silleteria", response=list[TipoSilleteriaOut])
def listar_tipos_silleteria(request):
    return service.listar_tipos_silleteria()


@router.post("/tipos-silleteria", response={201: TipoSilleteriaOut})
def crear_tipo_silleteria(request, payload: TipoSilleteriaIn):
    return 201, service.crear_tipo_silleteria(payload.nombre)


# ------------------------------------------------------------------
# Salon
# ------------------------------------------------------------------


@router.get("/salones", response=list[SalonOut])
def listar_salones(request):
    return service.listar_salones()


@router.post("/salones", response={201: SalonOut, 400: dict})
def crear_salon(request, payload: SalonIn):
    try:
        salon = service.crear_salon(
            payload.nombre,
            payload.bloque_id,
            payload.tipo_silleteria_id,
            cantidad_sillas=payload.cantidad_sillas,
            cantidad_mesas=payload.cantidad_mesas,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, salon
