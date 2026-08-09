"""
Tests de configuracion/controller.py — capa HTTP (router de Django Ninja),
vía `django.test.Client` contra la instancia real de `NinjaAPI` montada en
`config.urls` (sin mocks, mismo espíritu TDD del resto del proyecto).

Precedente nuevo en el proyecto (ver `sdd/scheduler-transiciones`, diseño):
antes de este cambio no existían tests a nivel de controller en ningún
módulo (solo `test_domain`/`test_repository`/`test_service`). Se agrega
acá porque `limite_no_reclamada_minutos` necesita probarse expuesto en el
schema/endpoint HTTP, no solo en `service.py` — el router de este módulo
no tiene `auth=` (ver `config/urls.py`), así que un `Client()` sin
credenciales basta.
"""

import json

import pytest
from django.test import Client

from catalogos import service as catalogos_service

pytestmark = pytest.mark.django_db


def _ubicacion(nombre="ubicacion-test-configuracion-controller"):
    return catalogos_service.crear_ubicacion(nombre)


def test_get_configuracion_expone_limite_no_reclamada_minutos():
    client = Client()

    response = client.get("/api/configuracion/")

    assert response.status_code == 200
    assert response.json()["limite_no_reclamada_minutos"] == 30


def test_post_configuracion_persiste_limite_no_reclamada_minutos_explicito():
    ubicacion = _ubicacion()
    client = Client()

    response = client.post(
        "/api/configuracion/",
        data=json.dumps(
            {
                "ubicacion_defecto_id": str(ubicacion.id),
                "limite_no_reclamada_minutos": 45,
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 201
    assert response.json()["limite_no_reclamada_minutos"] == 45


def test_put_configuracion_actualiza_limite_no_reclamada_minutos():
    ubicacion = _ubicacion()
    client = Client()
    client.post(
        "/api/configuracion/",
        data=json.dumps({"ubicacion_defecto_id": str(ubicacion.id)}),
        content_type="application/json",
    )

    response = client.put(
        "/api/configuracion/",
        data=json.dumps(
            {
                "ubicacion_defecto_id": str(ubicacion.id),
                "limite_antes_mora_minutos": 90,
                "max_reintentos_recordatorio": 1,
                "limite_no_reclamada_minutos": 60,
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["limite_no_reclamada_minutos"] == 60
