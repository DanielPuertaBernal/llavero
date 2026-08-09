from django.apps import AppConfig


class ComunidadConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "comunidad"

    def ready(self):
        # El proyecto usa "model.py" (singular) en vez del "models.py"
        # convencional de Django (ver convención de capas del backend).
        # Django solo autoimporta "<app>.models" al poblar el registro de
        # apps, así que sin este import explícito las clases de model.py
        # nunca se registran y `makemigrations`/`migrate` no las vería.
        from comunidad import model  # noqa: F401
