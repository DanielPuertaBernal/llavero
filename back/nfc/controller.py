"""
controller.py — router de Django Ninja del módulo nfc.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

`service.resolver_credencial`/`service.procesar_credencial` ya devuelven
`dict`s con valores JSON-nativos (ver docstring de `service.py`), así que
este controller los pasa directo como `response={200: dict, ...}` — mismo
patrón que `monitores.controller.clases_del_docente_titular` (que también
responde con `dict`s construidos a mano en vez de un `Schema` tipado,
porque la forma de la respuesta varía según la `accion` resuelta:
`no_reconocida`/`sin_coincidencia` no tienen los mismos campos que
`entrega`/`devolucion`/`ambigua`).

Dos endpoints, reflejando la distinción de solo-lectura vs mutación de
`service.py`:
- `POST /resolver`: solo lectura, llama a `resolver_credencial` — para
  que el frontend pueda mostrar una previsualización/confirmación (o
  presentar candidatos ambiguos al staff) sin efectos colaterales.
- `POST /procesar`: ejecuta la operación real (`procesar_credencial`) —
  crea o devuelve la llave si la resolución no es ambigua.

Ambos son POST (no GET), aunque `/resolver` no mute nada: `id_carnet`
identifica a una persona concreta y no debe viajar en la query string/URL
(logs de servidor, historial del navegador) — mismo criterio de no
exponer identificadores sensibles en la URL que ya aplica en el resto de
endpoints de auth de este proyecto.
"""

import uuid

from ninja import Router, Schema

from nfc import service

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class ResolverCredencialIn(Schema):
    id_carnet: str


class ProcesarCredencialIn(Schema):
    id_carnet: str
    usuario_id: uuid.UUID
    ubicacion_id: uuid.UUID
    novedad_id: uuid.UUID | None = None
    tipo_devolucion: str = "credencial"


# ------------------------------------------------------------------
# Resolución (solo lectura) / Procesamiento (ejecuta)
# ------------------------------------------------------------------


@router.post("/resolver", response={200: dict})
def resolver_credencial(request, payload: ResolverCredencialIn):
    return 200, service.resolver_credencial(payload.id_carnet)


@router.post("/procesar", response={200: dict, 400: dict})
def procesar_credencial(request, payload: ProcesarCredencialIn):
    try:
        resultado = service.procesar_credencial(
            payload.id_carnet,
            payload.usuario_id,
            payload.ubicacion_id,
            novedad_id=payload.novedad_id,
            tipo_devolucion=payload.tipo_devolucion,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, resultado
