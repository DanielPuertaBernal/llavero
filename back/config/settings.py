"""
Configuración de Django para el proyecto Llavero.

Todas las variables sensibles/dependientes de entorno se leen vía
django-environ desde un archivo .env (no versionado). Ver .env.example
para la lista de claves esperadas.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)

# Lee back/.env si existe (en producción las variables se inyectan
# directamente en el entorno del proceso, sin archivo .env).
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=[])

# Login federado con Office 365 (Entra ID) — ver auth/service.py. Requiere
# una App Registration real en Azure AD del tenant de la UCO para producción
# (Directory (tenant) ID y Application (client) ID); en desarrollo/test se
# usan valores dummy porque la validación de firma se testea contra un JWKS
# de prueba (RSA propio), sin red real a Microsoft (ver auth/tests/test_service.py).
AZURE_TENANT_ID = env("AZURE_TENANT_ID")
AZURE_CLIENT_ID = env("AZURE_CLIENT_ID")

# Login federado — Authorization Code con callback en el backend (confidential
# client): AZURE_CLIENT_SECRET se usa server-to-server en el intercambio
# code -> tokens (GET /callback, ver auth/service.py), nunca llega al
# navegador. AZURE_REDIRECT_URI debe coincidir exactamente con el redirect
# URI registrado en la App Registration de Azure AD. Tras resolver el login,
# el backend redirige el navegador a FRONTEND_POST_LOGIN_REDIRECT_URL con un
# código de intercambio opaco de un solo uso (ver
# auth.model.CodigoLoginTemporal) en la query string.
AZURE_CLIENT_SECRET = env("AZURE_CLIENT_SECRET")
AZURE_REDIRECT_URI = env("AZURE_REDIRECT_URI")
FRONTEND_POST_LOGIN_REDIRECT_URL = env("FRONTEND_POST_LOGIN_REDIRECT_URL")

# Clave compartida del endpoint protegido `POST /api/scheduler/
# ejecutar-transiciones` (ver scheduler/security.py y sdd/
# scheduler-transiciones/design, decisión 1b). Default vacío (mismo patrón
# que EMAIL_HOST_USER/EMAIL_HOST_PASSWORD) para no romper ningún .env/CI
# existente al hacer pull de este cambio — un valor vacío hace que el
# endpoint falle SIEMPRE en 401 (fail-closed, ver SchedulerApiKey), nunca
# que quede abierto sin autenticación.
SCHEDULER_API_KEY = env("SCHEDULER_API_KEY", default="")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "catalogos",
    "equipos",
    "usuarios",
    "comunidad",
    "programacion",
    "monitores",
    "novedades",
    "reservas",
    "reservas_semestrales",
    "llaves",
    "configuracion",
    "notificaciones",
    "prestamos",
    # nfc: sin tabla propia (RF04, orquestación pura sobre otros módulos
    # ya construidos, ver nfc/apps.py) — se registra igual por
    # consistencia estructural con el resto de módulos.
    "nfc",
    # No se agrega "ninja_jwt" (ni "ninja_jwt.token_blacklist"): solo se usan
    # sus primitivos de bajo nivel (ninja_jwt.tokens.RefreshToken/AccessToken),
    # que no requieren registro como Django app (ver nota de diseño en
    # auth/service.py sobre por qué no se usa el blacklist app).
    "auth",
    # scheduler: sin tabla propia, orquestador cross-módulo de transiciones
    # automáticas por tiempo (ver sdd/scheduler-transiciones/design) — se
    # registra igual por consistencia estructural, mismo criterio que "nfc".
    "scheduler",
]

# Config de django-ninja-jwt para los JWT propios (access+refresh) emitidos
# tras el login federado — ver auth/service.py. Mismos parámetros que el
# sistema legacy (AulaSync/analisis/backend/auth.md): access 8h, refresh 7d,
# rotación single-use + detección de reuso + tope de sesiones se implementan
# a mano en auth/service.py sobre la tabla sesion_refresh (no vía el
# blacklist app de ninja_jwt).
NINJA_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST", default="localhost"),
        "PORT": env("DB_PORT", default="5432"),
    }
}

# Relay SMTP institucional para el módulo notificaciones (ver env.example
# para el detalle completo de cada variable y notificaciones/service.py
# para cómo se usan). Backend estándar de Django (django.core.mail,
# smtp.EmailBackend) — sin cliente SMTP hecho a mano.
#
# Nota de diseño — EMAIL_HOST_FALLBACK NO se lee acá ni en ningún otro
# lado del código: es la IP del mismo relay (mail.uco.edu.co), documentada
# en env.example como referencia operativa para quien administre el
# servidor. No se implementa failover automático hacia esa IP (decisión
# de negocio no pedida) — ver la nota de diseño completa en
# notificaciones/service.py.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST")
EMAIL_PORT = env.int("EMAIL_PORT")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS")
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL")
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "es-co"

TIME_ZONE = "America/Bogota"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"

# No se usa en la práctica: todos los modelos declaran su propia PK UUID
# explícita (ver convención del proyecto), pero Django exige un valor válido.
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
