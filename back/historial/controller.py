"""
controller.py — router de Django Ninja del módulo historial.

HTTP puro: valida el request (vía el query param de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.

`service.listar_historial` ya devuelve una lista de `dict`s con valores
JSON-nativos (ver docstring de `service.py`), así que este controller la
pasa directo como `response={200: list[dict]}` — mismo patrón que
`monitores.controller.clases_del_docente_titular`/
`disponibilidad.controller.consultar_disponibilidad_salon` (módulos cuya
forma de respuesta no es un `Schema` tipado fijo).

Un único endpoint (RF27/RF28): `GET /historial/`, con `usuario_id` como
query param OPCIONAL de uuid. Este backend todavía no implementa
autorización por rol en ningún endpoint (ver nota en
`auth/controller.py`: "el resto de routers del proyecto siguen sin
protección de autenticación por ahora"), así que este endpoint tampoco
la inventa: expone el filtro como query param opcional y deja que el
frontend (en una tarea futura) decida cuándo pasarlo según el rol del
usuario autenticado — Portero pasaría su propio `usuario_id` (RF28: solo
ve lo que él mismo procesó), Administrador/Auxiliar no pasarían nada
(ven el historial completo) — siguiendo el mismo patrón ya usado en
`features/comunidad` del frontend con `crearGuardaDeRol` (responsabilidad
de frontend, no de este endpoint).

GET (no POST) porque es una consulta de solo lectura sin efectos
colaterales, y `usuario_id` no es un dato sensible en sí mismo (a
diferencia de `id_carnet` en `nfc.controller`, que si viaja en la URL sí
expone un identificador de persona) — mismo criterio que el resto de
endpoints `GET` de este proyecto.
"""

import uuid

from ninja import Router

from historial import service

router = Router()


@router.get("/", response={200: list[dict]})
def listar_historial(request, usuario_id: uuid.UUID | None = None):
    return 200, service.listar_historial(usuario_id=usuario_id)
