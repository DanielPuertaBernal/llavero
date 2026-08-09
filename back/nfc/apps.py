"""
apps.py — configuración de la app Django `nfc`.

Este módulo NO tiene tabla propia: se releyó el DDL completo
(DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, `grep -in nfc` sobre ese
archivo) y no existe ningún `CREATE TABLE nfc` ni nada parecido. Es un
módulo de ORQUESTACIÓN PURA (RF04, ver DOC/2. Diseño estratégico/2.2
Requerimientos.md): resuelve, a partir de una credencial escaneada, si
corresponde una entrega o devolución automática de llave, cruzando
exclusivamente los `.service` de módulos ya construidos (`comunidad`,
`llaves`, `programacion`, `reservas_semestrales`, `monitores`,
`catalogos`, `usuarios`). No hay `model.py`/`repository.py`/migraciones
acá — ver `domain.py`/`service.py` para la lógica real.

Se mantiene como Django app registrada en `INSTALLED_APPS` (ver
`config/settings.py`) por consistencia estructural con el resto del
proyecto ("cada módulo del backend es una Django app"), aunque nada en
Django estrictamente lo exija para un módulo sin modelos/migraciones/
signals/templatetags — se decidió no romper esa convención para el
único módulo que no tiene tabla, en vez de crear un caso especial que
alguien tendría que recordar.

A diferencia de `monitores.apps.MonitoresConfig` (y el resto de módulos
con tabla propia), este `AppConfig` NO sobreescribe `ready()`: ese hook
existe en los demás módulos por una razón puntual y verificada —
Django solo autoimporta "<app>.models" al poblar el registro de apps, y
este proyecto usa `model.py` (singular, no convencional), así que sin un
`ready()` que fuerce `from <app> import model` esas clases nunca se
registrarían y `makemigrations`/`migrate` no las vería. Sin `model.py`
en este módulo, no hay nada que autoimportar: agregar un `ready()` vacío
(o uno que intente importar un `model.py` inexistente) no aportaría
nada y rompería en el segundo caso — se omite explícitamente, no es un
descuido. Se verificó que Django arranca sin quejarse (`manage.py check`)
con un `AppConfig` mínimo sin `ready()`.
"""

from django.apps import AppConfig


class NfcConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "nfc"
