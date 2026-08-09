"""
domain.py — lógica de negocio pura del módulo scheduler (sin DB, sin I/O).

`debe_enviar_recordatorio` es la ÚNICA lógica pura que este módulo posee
(ver sdd/scheduler-transiciones/design, decisión 4): la aritmética de
umbral de tiempo (`es_mora`/`es_no_reclamada`) vive en `llaves.domain`/
`reservas.domain` respectivamente — cada módulo dueño protege su propia
regla de negocio, y `scheduler` solo orquesta llamándolas (ver
`service.py`). Lo único que `notificaciones.service` declinó
explícitamente resolver (ver docstring de ese módulo, sección "FUERA DE
ALCANCE") es la política de tope de reintentos: cuántos recordatorios ya
van vs. cuántos permite `configuracion.max_reintentos_recordatorio`. Esa
decisión es exactamente lo que vive acá.
"""


def debe_enviar_recordatorio(intentos_previos: int, max_reintentos: int) -> bool:
    """True si, habiendo ya `intentos_previos` recordatorios enviados para
    una llave, todavía corresponde enviar uno más (el número
    `intentos_previos + 1`) sin exceder `max_reintentos`.

    Límite inclusivo: si el siguiente intento es exactamente igual al
    tope, todavía se envía (es el último permitido); solo se omite
    cuando superaría el tope.
    """
    return intentos_previos + 1 <= max_reintentos
