"""
apps.py — configuración de la app Django `historial`.

Este módulo NO tiene tabla propia: RF27/RF28 (ver DOC/2. Diseño
estratégico/2.2 Requerimientos.md) piden un historial de "todas las
entregas y devoluciones (llaves y equipos), indicando quién las
procesó", pero esas entregas/devoluciones YA están registradas como
efecto colateral de los módulos que las procesan de verdad: cada fila de
`llaves.Llave` ES una entrega (y, si ya se devolvió, también una
devolución); cada `prestamos.Prestamo` (creación) ES una entrega de
equipos y cada `prestamos.Devolucion` ES una devolución de equipos. Es
la misma situación que `disponibilidad` (RF14/RF15) documenta en su
propio `apps.py`: un agregador de SOLO LECTURA sobre módulos ya
construidos, consultando exclusivamente el `.service` de cada uno
(`llaves.service`, `prestamos.service`, nunca su `model.py`/
`repository.py`). Ver DOC/4. DiseñoTacticoDetallado/4.3 Diagrama de
Paquetes.md (sección "Historial"): depende solo de `Core`, sin dueño de
tabla propia, mismo criterio que `Disponibilidad`.

No hay `model.py`/`repository.py`/migraciones acá — ver `domain.py`/
`service.py` para la lógica real, mismo precedente estructural que
`nfc`/`disponibilidad` (los otros dos módulos sin tabla propia de este
proyecto).

Se mantiene como Django app registrada en `INSTALLED_APPS` (ver
`config/settings.py`) por consistencia estructural con el resto del
proyecto ("cada módulo del backend es una Django app"), aunque nada en
Django estrictamente lo exija para un módulo sin modelos/migraciones/
signals/templatetags — mismo criterio ya fijado en `nfc/apps.py`/
`disponibilidad/apps.py`: no se rompe esa convención para el tercer
módulo sin tabla, en vez de crear un caso especial que alguien tendría
que recordar.

A diferencia de los módulos con tabla propia (que sí sobreescriben
`ready()` para forzar `from <app> import model`, porque este proyecto usa
`model.py` singular en vez de `models.py` y Django solo autoimporta ese
nombre convencional al poblar el registro de apps), este `AppConfig` NO
sobreescribe `ready()` — exactamente la misma razón ya documentada en
`nfc/apps.py`/`disponibilidad/apps.py`: sin `model.py` en este módulo, no
hay nada que autoimportar, así que agregar un `ready()` vacío (o uno que
intente importar un `model.py` inexistente) no aportaría nada y
rompería en el tercer caso — se omite explícitamente, no es un
descuido. Se verificó que Django arranca sin quejarse (`manage.py
check`) con un `AppConfig` mínimo sin `ready()`.
"""

from django.apps import AppConfig


class HistorialConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "historial"
