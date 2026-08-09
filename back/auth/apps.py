from django.apps import AppConfig


class AuthConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "auth"
    # Django exige labels de app únicos en todo INSTALLED_APPS. El label por
    # defecto de un AppConfig es el último componente de `name` ("auth"), que
    # colisiona con "django.contrib.auth" (label "auth" también) — ese app ya
    # está instalado y migrado en este proyecto (tablas auth_user/auth_group/
    # etc., no las usamos pero existen). Se fuerza un label explícito distinto
    # para poder nombrar esta carpeta/app "auth" (consistente con el resto de
    # módulos: nombre de carpeta = nombre de app Django) sin chocar con el app
    # nativo de Django. Efecto práctico: `makemigrations`/`showmigrations`
    # identifican este módulo como "auth_jwt", no como "auth".
    label = "auth_jwt"

    def ready(self):
        # El proyecto usa "model.py" (singular) en vez del "models.py"
        # convencional de Django (ver convención de capas del backend).
        # Django solo autoimporta "<app>.models" al poblar el registro de
        # apps, así que sin este import explícito las clases de model.py
        # nunca se registran y `makemigrations`/`migrate` no las vería.
        from auth import model  # noqa: F401
