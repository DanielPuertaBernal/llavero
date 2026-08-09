"""
apps.py — configuración de la app Django `scheduler`.

Este módulo NO tiene tabla propia: es el orquestador cross-módulo del
cambio `sdd/scheduler-transiciones` (ver ese diseño para el detalle
completo), estructuralmente clonado de `nfc/apps.py` (el otro módulo del
proyecto sin `model.py`/`repository.py`/migraciones): resuelve, en cada
invocación HTTP protegida por API key, qué llaves `en_prestamo`/
`demora_entrega` y qué reservas `aprobada` ya cruzaron sus límites de
tiempo, cruzando exclusivamente los `.service` (y las funciones puras de
`.domain`) de módulos ya construidos (`llaves`, `reservas`,
`notificaciones`, `configuracion`). No hay `model.py`/`repository.py`
acá — ver `domain.py`/`service.py` para la lógica real.

Se mantiene como Django app registrada en `INSTALLED_APPS` (ver
`config/settings.py`) por consistencia estructural con el resto del
proyecto ("cada módulo del backend es una Django app"), mismo criterio
documentado en `nfc/apps.py`.

A diferencia de los módulos con tabla propia, este `AppConfig` NO
sobreescribe `ready()`: sin `model.py` no hay nada que autoimportar
(mismo razonamiento verbatim que `nfc/apps.py` — ver ese docstring para
el detalle completo de por qué).
"""

from django.apps import AppConfig


class SchedulerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "scheduler"
