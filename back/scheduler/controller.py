"""
controller.py — router de Django Ninja del módulo scheduler.

HTTP puro: valida la autenticación (`auth=SchedulerApiKey()`, ver
`security.py`), llama a `service.ejecutar_transiciones`, formatea la
response. Sin lógica de negocio acá — igual convención que el resto de
`controller.py` del proyecto (ver `nfc/controller.py`).

Un único endpoint (ver sdd/scheduler-transiciones/design, "Response
contract"): `POST /ejecutar-transiciones` (montado en
`/api/scheduler/ejecutar-transiciones`, ver `config/urls.py`). Es POST,
no GET, porque MUTA estado (transiciones + envío de notificaciones) —
mismo criterio que el resto de operaciones de escritura del proyecto.

`auth=SchedulerApiKey()` a nivel de `Router` (no de `NinjaAPI` global, ni
por-endpoint): este router solo tiene un endpoint hoy, pero el gate queda
declarado a nivel de router para que cualquier endpoint futuro que se
agregue acá herede la misma protección sin tener que repetir `auth=` en
cada uno (ver decisión de diseño 1 del cambio).

Sin camino de error explícito en el schema de respuesta: `service.
ejecutar_transiciones` nunca lanza (aísla cada fila con su propio
`try/except ValueError`, ver `service.py`) — el único camino de fallo de
este endpoint es la autenticación (401, manejado por django-ninja antes
de que este handler se ejecute siquiera).
"""

from ninja import Router, Schema

from scheduler import service
from scheduler.security import SchedulerApiKey

router = Router(auth=SchedulerApiKey())


class EjecucionOut(Schema):
    llaves_marcadas_en_demora: int
    recordatorios_enviados: int
    recordatorios_omitidos_por_tope: int
    reservas_marcadas_no_reclamada: int
    vencimientos_enviados: int
    errores: int


@router.post("/ejecutar-transiciones", response=EjecucionOut)
def ejecutar_transiciones(request):
    return service.ejecutar_transiciones()
