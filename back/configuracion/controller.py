"""
controller.py — router de Django Ninja del módulo configuracion.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

Nota — GET nunca devuelve 404: `service.obtener_configuracion` es un
get-or-create (ver ese docstring), así que esta tabla nunca está "vacía"
desde el punto de vista de un consumidor HTTP.
"""

import uuid

from ninja import Router, Schema

from configuracion import service

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class ConfiguracionOut(Schema):
    id: uuid.UUID
    limite_antes_mora_minutos: int
    max_reintentos_recordatorio: int
    plantilla_recordatorio: str | None
    ubicacion_defecto_id: uuid.UUID
    limite_no_reclamada_minutos: int


class ConfiguracionIn(Schema):
    ubicacion_defecto_id: uuid.UUID
    limite_antes_mora_minutos: int = 120
    max_reintentos_recordatorio: int = 3
    plantilla_recordatorio: str | None = None
    limite_no_reclamada_minutos: int = 30


# ------------------------------------------------------------------
# Configuracion
# ------------------------------------------------------------------


@router.get("/", response=ConfiguracionOut)
def obtener_configuracion(request):
    return service.obtener_configuracion()


@router.post("/", response={201: ConfiguracionOut, 400: dict})
def crear_configuracion(request, payload: ConfiguracionIn):
    try:
        configuracion = service.crear_configuracion(
            payload.ubicacion_defecto_id,
            limite_antes_mora_minutos=payload.limite_antes_mora_minutos,
            max_reintentos_recordatorio=payload.max_reintentos_recordatorio,
            plantilla_recordatorio=payload.plantilla_recordatorio,
            limite_no_reclamada_minutos=payload.limite_no_reclamada_minutos,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, configuracion


@router.put("/", response={200: ConfiguracionOut, 400: dict})
def actualizar_configuracion(request, payload: ConfiguracionIn):
    try:
        configuracion = service.actualizar_configuracion(
            payload.ubicacion_defecto_id,
            payload.limite_antes_mora_minutos,
            payload.max_reintentos_recordatorio,
            payload.plantilla_recordatorio,
            limite_no_reclamada_minutos=payload.limite_no_reclamada_minutos,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, configuracion
