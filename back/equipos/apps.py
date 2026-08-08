from django.apps import AppConfig


class EquiposConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "equipos"

    def ready(self):
        # El proyecto usa "model.py" (singular) en vez del "models.py"
        # convencional de Django (ver convención de capas del backend).
        # Django solo autoimporta "<app>.models" al poblar el registro de
        # apps, así que sin este import explícito las clases de model.py
        # nunca se registran y `makemigrations`/`migrate` no las vería.
        from equipos import model  # noqa: F401
