"""
apps.py — configuración de la app Django `disponibilidad`.

Este módulo NO tiene tabla propia: se releyó el DDL completo
(DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, `grep -in disponibilidad` sobre
ese archivo) y no existe ningún `CREATE TABLE disponibilidad` ni nada
parecido. Es la excepción explícita documentada en DOC/4.
DiseñoTacticoDetallado/4.3 Diagrama de Paquetes.md (sección
"Disponibilidad") a la regla "todos dependen solo de Core": un agregador de
SOLO LECTURA (RF14, RF15 — ver DOC/2. Diseño estratégico/2.2
Requerimientos.md) que superpone, en un único calendario, la programación
académica oficial (`programacion`), las reservas semestrales
(`reservas_semestrales`) y las reservas individuales (`reservas`),
consultando exclusivamente el `.service` de cada una (nunca su
`model.py`/`repository.py`). No hay `model.py`/`repository.py`/migraciones
acá — ver `domain.py`/`service.py` para la lógica real, mismo precedente
estructural que `nfc` (el otro único módulo sin tabla propia de este
proyecto).

Se mantiene como Django app registrada en `INSTALLED_APPS` (ver
`config/settings.py`) por consistencia estructural con el resto del
proyecto ("cada módulo del backend es una Django app"), aunque nada en
Django estrictamente lo exija para un módulo sin modelos/migraciones/
signals/templatetags — mismo criterio ya fijado en `nfc/apps.py`: no se
rompe esa convención para el segundo módulo sin tabla, en vez de crear un
caso especial que alguien tendría que recordar.

A diferencia de los módulos con tabla propia (que sí sobreescriben
`ready()` para forzar `from <app> import model`, porque este proyecto usa
`model.py` singular en vez de `models.py` y Django solo autoimporta ese
nombre convencional al poblar el registro de apps), este `AppConfig` NO
sobreescribe `ready()` — exactamente la misma razón ya documentada en
`nfc/apps.py`: sin `model.py` en este módulo, no hay nada que autoimportar,
así que agregar un `ready()` vacío (o uno que intente importar un
`model.py` inexistente) no aportaría nada y rompería en el segundo caso —
se omite explícitamente, no es un descuido. Se verificó que Django arranca
sin quejarse (`manage.py check`) con un `AppConfig` mínimo sin `ready()`.
"""

from django.apps import AppConfig


class DisponibilidadConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "disponibilidad"
