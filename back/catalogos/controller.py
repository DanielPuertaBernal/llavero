"""
controller.py — router de Django Ninja del módulo catalogos.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

PATCH/DELETE (agregados para las 6 entidades antes de construir el
frontend de Catalogos, que necesita CRUD completo):

- No hay precedente de PATCH en ningún módulo del backend (se buscó
  `@router.patch`/`@router.put` en todo `back/` antes de escribir esto).
  Se usa el semántica estándar de partial update: cada `*Patch` schema
  declara todos sus campos `Optional[...] = None`, y el controller llama
  `payload.model_dump(exclude_unset=True)` (no `.dict()`, deprecado en
  Pydantic v2) para distinguir "el cliente no envió este campo" de "el
  cliente lo envió explícitamente en su valor por defecto" (p. ej.
  `cantidad_sillas: 0` en Salon, o `permite_prestamo_equipos: False` en
  Ubicacion) — un campo no enviado no se toca; uno enviado, aunque sea
  falsy, sí se actualiza. Ver `repository.actualizar_ubicacion` para la
  otra mitad de este contrato (capa repository).
- DELETE sí tiene un precedente en el proyecto:
  `comunidad.controller.eliminar_persona` (`@router.delete(...,
  response={204: None, 404: dict})`, 204 sin cuerpo en éxito, 404 si no
  existe). Se reutiliza esa misma forma acá, agregando 400 para el caso
  nuevo que comunidad no tiene: la entidad sigue referenciada por otro
  registro (`ProtectedError` traducido a ValueError en `service.py`, ver
  su docstring — decisión ya verificada por el orquestador: cada una de
  las 6 entidades de este módulo tiene al menos una FK `on_delete=PROTECT`
  apuntándole desde otro módulo).
- Ambos endpoints hacen el chequeo de existencia (`service.obtener_*`)
  ANTES de llamar a `actualizar_*`/`eliminar_*`, devolviendo 404 ahí
  mismo: así el 404 nunca depende de inspeccionar el mensaje del
  ValueError que lanza el service (que sigue lanzando ValueError también
  ante "no existe" para cualquier otro caller directo que no lo
  precheckee, ver `service.py`) — el único ValueError que este controller
  puede recibir de `actualizar_*`/`eliminar_*` es entonces una FK
  inválida (Salon) o un ProtectedError traducido, ambos mapeados a 400.
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


class RolPatch(Schema):
    nombre: str | None = None


class TipoPersonaOut(Schema):
    id: uuid.UUID
    nombre: str


class TipoPersonaIn(Schema):
    nombre: str


class TipoPersonaPatch(Schema):
    nombre: str | None = None


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


class UbicacionPatch(Schema):
    nombre: str | None = None
    permite_prestamo_llaves: bool | None = None
    permite_devolucion_llaves: bool | None = None
    permite_prestamo_equipos: bool | None = None


class BloqueOut(Schema):
    id: uuid.UUID
    nombre: str


class BloqueIn(Schema):
    nombre: str


class BloquePatch(Schema):
    nombre: str | None = None


class TipoSilleteriaOut(Schema):
    id: uuid.UUID
    nombre: str


class TipoSilleteriaIn(Schema):
    nombre: str


class TipoSilleteriaPatch(Schema):
    nombre: str | None = None


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


class SalonPatch(Schema):
    nombre: str | None = None
    bloque_id: uuid.UUID | None = None
    tipo_silleteria_id: uuid.UUID | None = None
    cantidad_sillas: int | None = None
    cantidad_mesas: int | None = None


# ------------------------------------------------------------------
# Rol
# ------------------------------------------------------------------


@router.get("/roles", response=list[RolOut])
def listar_roles(request):
    return service.listar_roles()


@router.post("/roles", response={201: RolOut})
def crear_rol(request, payload: RolIn):
    return 201, service.crear_rol(payload.nombre)


@router.patch("/roles/{rol_id}", response={200: RolOut, 404: dict, 400: dict})
def actualizar_rol(request, rol_id: uuid.UUID, payload: RolPatch):
    if service.obtener_rol(rol_id) is None:
        return 404, {"detail": "Rol no encontrado"}
    datos = payload.model_dump(exclude_unset=True)
    try:
        rol = service.actualizar_rol(rol_id, **datos)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, rol


@router.delete("/roles/{rol_id}", response={204: None, 404: dict, 400: dict})
def eliminar_rol(request, rol_id: uuid.UUID):
    if service.obtener_rol(rol_id) is None:
        return 404, {"detail": "Rol no encontrado"}
    try:
        service.eliminar_rol(rol_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 204, None


# ------------------------------------------------------------------
# TipoPersona
# ------------------------------------------------------------------


@router.get("/tipos-persona", response=list[TipoPersonaOut])
def listar_tipos_persona(request):
    return service.listar_tipos_persona()


@router.post("/tipos-persona", response={201: TipoPersonaOut})
def crear_tipo_persona(request, payload: TipoPersonaIn):
    return 201, service.crear_tipo_persona(payload.nombre)


@router.patch(
    "/tipos-persona/{tipo_persona_id}",
    response={200: TipoPersonaOut, 404: dict, 400: dict},
)
def actualizar_tipo_persona(request, tipo_persona_id: uuid.UUID, payload: TipoPersonaPatch):
    if service.obtener_tipo_persona(tipo_persona_id) is None:
        return 404, {"detail": "TipoPersona no encontrado"}
    datos = payload.model_dump(exclude_unset=True)
    try:
        tipo_persona = service.actualizar_tipo_persona(tipo_persona_id, **datos)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, tipo_persona


@router.delete(
    "/tipos-persona/{tipo_persona_id}", response={204: None, 404: dict, 400: dict}
)
def eliminar_tipo_persona(request, tipo_persona_id: uuid.UUID):
    if service.obtener_tipo_persona(tipo_persona_id) is None:
        return 404, {"detail": "TipoPersona no encontrado"}
    try:
        service.eliminar_tipo_persona(tipo_persona_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 204, None


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


@router.patch(
    "/ubicaciones/{ubicacion_id}", response={200: UbicacionOut, 404: dict, 400: dict}
)
def actualizar_ubicacion(request, ubicacion_id: uuid.UUID, payload: UbicacionPatch):
    if service.obtener_ubicacion(ubicacion_id) is None:
        return 404, {"detail": "Ubicacion no encontrada"}
    datos = payload.model_dump(exclude_unset=True)
    try:
        ubicacion = service.actualizar_ubicacion(ubicacion_id, **datos)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, ubicacion


@router.delete(
    "/ubicaciones/{ubicacion_id}", response={204: None, 404: dict, 400: dict}
)
def eliminar_ubicacion(request, ubicacion_id: uuid.UUID):
    if service.obtener_ubicacion(ubicacion_id) is None:
        return 404, {"detail": "Ubicacion no encontrada"}
    try:
        service.eliminar_ubicacion(ubicacion_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 204, None


# ------------------------------------------------------------------
# Bloque
# ------------------------------------------------------------------


@router.get("/bloques", response=list[BloqueOut])
def listar_bloques(request):
    return service.listar_bloques()


@router.post("/bloques", response={201: BloqueOut})
def crear_bloque(request, payload: BloqueIn):
    return 201, service.crear_bloque(payload.nombre)


@router.patch("/bloques/{bloque_id}", response={200: BloqueOut, 404: dict, 400: dict})
def actualizar_bloque(request, bloque_id: uuid.UUID, payload: BloquePatch):
    if service.obtener_bloque(bloque_id) is None:
        return 404, {"detail": "Bloque no encontrado"}
    datos = payload.model_dump(exclude_unset=True)
    try:
        bloque = service.actualizar_bloque(bloque_id, **datos)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, bloque


@router.delete("/bloques/{bloque_id}", response={204: None, 404: dict, 400: dict})
def eliminar_bloque(request, bloque_id: uuid.UUID):
    if service.obtener_bloque(bloque_id) is None:
        return 404, {"detail": "Bloque no encontrado"}
    try:
        service.eliminar_bloque(bloque_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 204, None


# ------------------------------------------------------------------
# TipoSilleteria
# ------------------------------------------------------------------


@router.get("/tipos-silleteria", response=list[TipoSilleteriaOut])
def listar_tipos_silleteria(request):
    return service.listar_tipos_silleteria()


@router.post("/tipos-silleteria", response={201: TipoSilleteriaOut})
def crear_tipo_silleteria(request, payload: TipoSilleteriaIn):
    return 201, service.crear_tipo_silleteria(payload.nombre)


@router.patch(
    "/tipos-silleteria/{tipo_silleteria_id}",
    response={200: TipoSilleteriaOut, 404: dict, 400: dict},
)
def actualizar_tipo_silleteria(
    request, tipo_silleteria_id: uuid.UUID, payload: TipoSilleteriaPatch
):
    if service.obtener_tipo_silleteria(tipo_silleteria_id) is None:
        return 404, {"detail": "TipoSilleteria no encontrado"}
    datos = payload.model_dump(exclude_unset=True)
    try:
        tipo_silleteria = service.actualizar_tipo_silleteria(tipo_silleteria_id, **datos)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, tipo_silleteria


@router.delete(
    "/tipos-silleteria/{tipo_silleteria_id}", response={204: None, 404: dict, 400: dict}
)
def eliminar_tipo_silleteria(request, tipo_silleteria_id: uuid.UUID):
    if service.obtener_tipo_silleteria(tipo_silleteria_id) is None:
        return 404, {"detail": "TipoSilleteria no encontrado"}
    try:
        service.eliminar_tipo_silleteria(tipo_silleteria_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 204, None


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


@router.patch("/salones/{salon_id}", response={200: SalonOut, 404: dict, 400: dict})
def actualizar_salon(request, salon_id: uuid.UUID, payload: SalonPatch):
    if service.obtener_salon(salon_id) is None:
        return 404, {"detail": "Salon no encontrado"}
    datos = payload.model_dump(exclude_unset=True)
    try:
        salon = service.actualizar_salon(salon_id, **datos)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, salon


@router.delete("/salones/{salon_id}", response={204: None, 404: dict, 400: dict})
def eliminar_salon(request, salon_id: uuid.UUID):
    if service.obtener_salon(salon_id) is None:
        return 404, {"detail": "Salon no encontrado"}
    try:
        service.eliminar_salon(salon_id)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 204, None
