"""
Tests de scheduler/controller.py — capa HTTP (router de Django Ninja) vía
`django.test.Client` contra la instancia real de `NinjaAPI` montada en
`config.urls` (sin mocks, mismo espíritu TDD que
`configuracion/tests/test_controller.py`, el precedente de este patrón en
el proyecto — ver sdd/scheduler-transiciones/design, "Verified precedent
gap").

A diferencia de `configuracion` (router sin `auth=`), este router SÍ está
protegido (`Router(auth=SchedulerApiKey())`, ver `security.py`): el gate
de autenticación y el status 401 son exactamente lo que
`test_security.py` NO puede probar (esos tests llaman `authenticate`
directamente, sin pasar por el router real) — de ahí que este archivo
exista además de `test_security.py`, no en su lugar.

`@override_settings(SCHEDULER_API_KEY=...)` mantiene los tests lejos del
`.env` real, mismo criterio que `auth` usa valores dummy de Azure.
"""

import pytest
from django.test import Client, override_settings

pytestmark = pytest.mark.django_db

URL = "/api/scheduler/ejecutar-transiciones"
CLAVE_VALIDA = "clave-de-prueba-scheduler"


@override_settings(SCHEDULER_API_KEY=CLAVE_VALIDA)
def test_post_ejecutar_transiciones_con_clave_correcta_devuelve_200_con_los_conteos():
    client = Client()

    response = client.post(URL, HTTP_X_SCHEDULER_API_KEY=CLAVE_VALIDA)

    assert response.status_code == 200
    cuerpo = response.json()
    assert set(cuerpo.keys()) == {
        "llaves_marcadas_en_demora",
        "recordatorios_enviados",
        "recordatorios_omitidos_por_tope",
        "reservas_marcadas_no_reclamada",
        "vencimientos_enviados",
        "errores",
    }
    # Sin ninguna llave/reserva elegible en la base de datos de este test,
    # todos los conteos deben ser exactamente cero (no solo "presentes").
    assert all(valor == 0 for valor in cuerpo.values())


@override_settings(SCHEDULER_API_KEY=CLAVE_VALIDA)
def test_post_ejecutar_transiciones_sin_header_devuelve_401():
    client = Client()

    response = client.post(URL)

    assert response.status_code == 401


@override_settings(SCHEDULER_API_KEY=CLAVE_VALIDA)
def test_post_ejecutar_transiciones_con_clave_incorrecta_devuelve_401():
    client = Client()

    response = client.post(URL, HTTP_X_SCHEDULER_API_KEY="clave-incorrecta")

    assert response.status_code == 401


@override_settings(SCHEDULER_API_KEY="")
def test_post_ejecutar_transiciones_con_clave_configurada_vacia_devuelve_401_aun_con_header():
    client = Client()

    response = client.post(URL, HTTP_X_SCHEDULER_API_KEY="cualquier-valor")

    assert response.status_code == 401
