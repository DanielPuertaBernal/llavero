"""
Tests de scheduler/security.py — matriz de amenazas del único punto de
entrada HTTP protegido de este módulo (`POST /ejecutar-transiciones`, ver
controller.py). No usan `django.test.Client` (eso vive en
test_controller.py, que prueba el status HTTP real vía el router
montado): estos tests llaman `SchedulerApiKey().authenticate(request, key)`
directamente, sin request real, porque `authenticate` no toca `request`
para nada (ver `security.py`) — es una función pura sobre
`settings.SCHEDULER_API_KEY` + `key`.

Casos de la matriz de amenazas (ver sdd/scheduler-transiciones/design,
sección "Threat Matrix"): header faltante, clave incorrecta, clave
configurada vacía (fail-closed) incluso con un header presente, y
comparación en tiempo constante (`hmac.compare_digest`, no `==`).
"""

import pytest

from scheduler.security import SchedulerApiKey


@pytest.fixture
def auth():
    return SchedulerApiKey()


def test_authenticate_con_clave_correcta_devuelve_principal(settings, auth):
    settings.SCHEDULER_API_KEY = "clave-de-prueba"

    assert auth.authenticate(None, "clave-de-prueba") == "scheduler"


def test_authenticate_sin_header_devuelve_none(settings, auth):
    settings.SCHEDULER_API_KEY = "clave-de-prueba"

    assert auth.authenticate(None, None) is None


def test_authenticate_con_clave_incorrecta_devuelve_none(settings, auth):
    settings.SCHEDULER_API_KEY = "clave-de-prueba"

    assert auth.authenticate(None, "clave-incorrecta") is None


def test_authenticate_con_clave_configurada_vacia_y_header_presente_devuelve_none(
    settings, auth
):
    settings.SCHEDULER_API_KEY = ""

    assert auth.authenticate(None, "cualquier-valor") is None


def test_authenticate_con_clave_configurada_vacia_y_sin_header_devuelve_none(
    settings, auth
):
    settings.SCHEDULER_API_KEY = ""

    assert auth.authenticate(None, None) is None


def test_authenticate_usa_comparacion_en_tiempo_constante(settings, auth, monkeypatch):
    """`hmac.compare_digest` debe ser lo que decide la comparación, no `==`
    — se verifica llamando a la función real de `hmac` (no un mock que
    reemplace la lógica) y confirmando que su resultado es el que se
    devuelve, para una clave que coincide y otra que no.
    """
    import hmac as hmac_module

    llamadas = []
    original = hmac_module.compare_digest

    def _compare_digest_espia(a, b):
        resultado = original(a, b)
        llamadas.append(resultado)
        return resultado

    monkeypatch.setattr("scheduler.security.hmac.compare_digest", _compare_digest_espia)
    settings.SCHEDULER_API_KEY = "clave-de-prueba"

    assert auth.authenticate(None, "clave-de-prueba") == "scheduler"
    assert auth.authenticate(None, "otra-clave") is None
    assert llamadas == [True, False]
