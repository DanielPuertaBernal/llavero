"""
Test del middleware CORS (django-cors-headers, ver settings.py
CORS_ALLOWED_ORIGINS/MIDDLEWARE): el frontend (Angular, origen distinto al
backend en cualquier entorno) necesita la cabecera Access-Control-Allow-
Origin en las responses para que el navegador no bloquee el fetch.

Usa `django.test.Client` contra un endpoint público real (GET
/api/catalogos/roles, sin auth) en vez de mockear el middleware — mismo
patrón que `catalogos/tests/test_controller.py`.
"""

import pytest
from django.test import Client, override_settings

pytestmark = pytest.mark.django_db


@override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:4200"])
def test_origen_permitido_recibe_la_cabecera_access_control_allow_origin():
    respuesta = Client().get("/api/catalogos/roles", HTTP_ORIGIN="http://localhost:4200")

    assert respuesta["Access-Control-Allow-Origin"] == "http://localhost:4200"


@override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:4200"])
def test_origen_no_permitido_no_recibe_la_cabecera():
    respuesta = Client().get("/api/catalogos/roles", HTTP_ORIGIN="http://evil.example.com")

    assert "Access-Control-Allow-Origin" not in respuesta
