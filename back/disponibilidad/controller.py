"""
controller.py — router de Django Ninja del módulo disponibilidad.

HTTP puro: valida el request (vía los query params de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

`service.consultar_disponibilidad_salon` ya devuelve un `dict` con valores
JSON-nativos (ver docstring de `service.py`), así que este controller lo
pasa directo como `response={200: dict, ...}` — mismo patrón que
`nfc.controller` (el otro módulo sin tabla propia, cuya forma de respuesta
tampoco es un `Schema` tipado fijo).

Un único endpoint (RF14): `GET /disponibilidad/salon/{salon_id}`, con
`dia`/`fecha` como query params OPCIONALES — GET porque es una consulta de
solo lectura sin efectos colaterales (a diferencia de `POST /nfc/resolver`,
que es POST solo para no exponer `id_carnet`, un identificador de persona,
en la URL; acá `salon_id` no es un dato sensible, es el mismo criterio que
el resto de endpoints `GET /{id}` del proyecto).
"""

import datetime
import uuid

from ninja import Router

from disponibilidad import service

router = Router()


@router.get("/salon/{salon_id}", response={200: dict, 400: dict})
def consultar_disponibilidad_salon(
    request,
    salon_id: uuid.UUID,
    dia: str | None = None,
    fecha: datetime.date | None = None,
):
    try:
        resultado = service.consultar_disponibilidad_salon(salon_id, dia=dia, fecha=fecha)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, resultado
