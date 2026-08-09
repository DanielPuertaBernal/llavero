"""
Tests de scheduler/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia de test_service.py/test_controller.py, no llevan
`pytestmark = pytest.mark.django_db`.
"""

from scheduler.domain import debe_enviar_recordatorio


def test_debe_enviar_recordatorio_primer_intento_bajo_el_tope_es_true():
    assert debe_enviar_recordatorio(0, 3) is True


def test_debe_enviar_recordatorio_intentos_previos_mas_uno_igual_al_tope_es_true():
    # 2 intentos previos + este sería el 3ro: 3 <= 3, todavía corresponde.
    assert debe_enviar_recordatorio(2, 3) is True


def test_debe_enviar_recordatorio_intentos_previos_mas_uno_supera_el_tope_es_false():
    # 3 intentos previos + este sería el 4to: 4 > 3, ya se agotó el tope.
    assert debe_enviar_recordatorio(3, 3) is False


def test_debe_enviar_recordatorio_con_tope_cero_nunca_envia():
    assert debe_enviar_recordatorio(0, 0) is False
