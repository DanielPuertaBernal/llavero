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

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "catalogos",
    "equipos",
    "usuarios",
    "comunidad",
    "programacion",
    "configuracion",
    # No se agrega "ninja_jwt" (ni "ninja_jwt.token_blacklist"): solo se usan
    # sus primitivos de bajo nivel (ninja_jwt.tokens.RefreshToken/AccessToken),
    # que no requieren registro como Django app (ver nota de diseño en
    # auth/service.py sobre por qué no se usa el blacklist app).
    "auth",
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

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "es-co"

TIME_ZONE = "America/Bogota"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"

# No se usa en la práctica: todos los modelos declaran su propia PK UUID
# explícita (ver convención del proyecto), pero Django exige un valor válido.
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
