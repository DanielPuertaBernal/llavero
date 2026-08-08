"""
controller.py — router de Django Ninja del módulo comunidad.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

Nota — sin endpoint de sync masivo del ETL todavía: `service.py` ya
expone `crear_o_actualizar_por_documento` (upsert atómico por registro,
ver su docstring), listo para que un futuro `POST /sync` lo invoque una
vez por registro del batch. No se agrega ese endpoint acá porque su
protección real (API key del sistema externo) es responsabilidad de un
middleware/auth que todavía no existe en este backend — exponerlo ahora
sin esa protección repetiría el hallazgo de auditoría del legacy
(`POST /api/comunidad/sync` público sin ninguna mitigación, ver
AulaSync/analisis/backend/comunidad.md §7).
"""

import uuid

from ninja import Router, Schema

from comunidad import service

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class ComunidadOut(Schema):
    id: uuid.UUID
    numero_documento: str
    nombre: str
    tipo_persona_id: uuid.UUID
    id_carnet: str | None
    correo: str | None
    numero_contacto: str | None
    facultad: str | None


class ComunidadIn(Schema):
    numero_documento: str
    nombre: str
    tipo_persona_id: uuid.UUID
    id_carnet: str | None = None
    correo: str | None = None
    numero_contacto: str | None = None
    facultad: str | None = None


# ------------------------------------------------------------------
# Comunidad
# ------------------------------------------------------------------


@router.get("/", response=list[ComunidadOut])
def listar_comunidad(request):
    return service.listar_comunidad()


@router.get("/{persona_id}", response={200: ComunidadOut, 404: dict})
def obtener_persona(request, persona_id: uuid.UUID):
    persona = service.obtener_persona(persona_id)
    if persona is None:
        return 404, {"detail": "Persona no encontrada"}
    return 200, persona


@router.get("/documento/{numero_documento}", response={200: ComunidadOut, 404: dict})
def obtener_por_documento(request, numero_documento: str):
    persona = service.obtener_por_documento(numero_documento)
    if persona is None:
        return 404, {"detail": "Persona no encontrada"}
    return 200, persona


@router.get("/carnet/{id_carnet}", response={200: ComunidadOut, 404: dict})
def obtener_por_carnet(request, id_carnet: str):
    persona = service.obtener_por_carnet(id_carnet)
    if persona is None:
        return 404, {"detail": "Persona no encontrada"}
    return 200, persona


@router.post("/", response={201: ComunidadOut, 400: dict})
def crear_persona(request, payload: ComunidadIn):
    try:
        persona = service.crear_persona(
            payload.numero_documento,
            payload.nombre,
            payload.tipo_persona_id,
            id_carnet=payload.id_carnet,
            correo=payload.correo,
            numero_contacto=payload.numero_contacto,
            facultad=payload.facultad,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, persona


@router.delete("/{persona_id}", response={204: None, 404: dict})
def eliminar_persona(request, persona_id: uuid.UUID):
    eliminado = service.eliminar_persona(persona_id)
    if not eliminado:
        return 404, {"detail": "Persona no encontrada"}
    return 204, None
