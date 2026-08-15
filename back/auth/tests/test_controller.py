"""
Tests de auth/controller.py — capa HTTP del router de Django Ninja, vía
`django.test.Client` contra la instancia real de `NinjaAPI` montada en
`config.urls` (sin mocks), mismo patrón que
`historial/tests/test_controller.py`.

Este módulo no tenía test de controller hasta ahora (login-institucional,
`GET /auth/login`): la lógica real de armado de la URL de autorización ya
está exhaustivamente cubierta en `test_service.py`; acá solo se cubre el
contrato HTTP del endpoint — el 302 y el `Location` — con y sin el query
param opcional `login_hint`.
"""

import pytest
from django.conf import settings
from django.test import Client

pytestmark = pytest.mark.django_db


def test_login_sin_login_hint_redirige_a_microsoft_sin_ese_parametro():
    respuesta = Client().get("/api/auth/login")

    assert respuesta.status_code == 302
    location = respuesta["Location"]
    assert location.startswith(
        f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/authorize?"
    )
    assert "login_hint" not in location


def test_login_con_login_hint_lo_incluye_en_el_redirect():
    respuesta = Client().get("/api/auth/login", {"login_hint": "nombre@uco.edu.co"})

    assert respuesta.status_code == 302
    assert "login_hint=nombre%40uco.edu.co" in respuesta["Location"]


def test_login_con_login_hint_de_dominio_no_institucional_no_es_rechazado():
    # El backend no valida/rechaza el dominio de login_hint — es una regla
    # solo de UX del frontend (ver login-institucional, RF33).
    respuesta = Client().get("/api/auth/login", {"login_hint": "someone@gmail.com"})

    assert respuesta.status_code == 302
    assert "login_hint=someone%40gmail.com" in respuesta["Location"]
