"""
security.py — autenticación del único endpoint HTTP de `scheduler`
(`POST /ejecutar-transiciones`, ver controller.py).

Primer primitivo de autenticación servicio-a-servicio del proyecto (ver
sdd/scheduler-transiciones/design, decisión 1): a diferencia de `auth`
(login federado de personas vía Office 365/Entra ID, JWT de sesión), el
único llamador previsto acá es un scheduler externo (cron/servicio
programado fuera de este backend, ver design decisión 2) sin usuario
humano detrás — una clave compartida simple (`APIKeyHeader` de Django
Ninja) es el mecanismo correcto, no `HttpBearer`/`ninja_jwt`.

`param_name = "X-Scheduler-Api-Key"`: nombre explícito, no genérico
(`X-Api-Key`), para que quede claro en logs/documentación cuál es el
único consumidor legítimo de este header.

Fail-closed (decisión 1b/1c): si `settings.SCHEDULER_API_KEY` está vacío
(default cuando la variable de entorno no está configurada, ver
`config/settings.py`) o si no llega header (`key` es `None`/cadena
vacía), `authenticate` devuelve `None` SIEMPRE — nunca compara nada. Esto
evita el bug clásico de "clave vacía == header vacío" que dejaría el
endpoint abierto sin autenticación real. `django-ninja` traduce un
`authenticate` que devuelve `None` en la respuesta 401 estándar
(`AuthenticationError`, `{"detail": "Unauthorized"}`) — ver decisión 1c
del diseño sobre por qué 401 y no 403.

`hmac.compare_digest` (no `==`): comparación en tiempo constante, para no
filtrar por temporización cuántos caracteres iniciales de la clave
coinciden — el estándar para comparar secretos en Python.
"""

import hmac

from django.conf import settings
from ninja.security import APIKeyHeader


class SchedulerApiKey(APIKeyHeader):
    param_name = "X-Scheduler-Api-Key"

    def authenticate(self, request, key):
        esperada = settings.SCHEDULER_API_KEY
        if not esperada or not key:
            return None
        if hmac.compare_digest(key, esperada):
            return "scheduler"
        return None
