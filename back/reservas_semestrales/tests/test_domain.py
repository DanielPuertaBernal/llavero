"""
Tests de reservas_semestrales/domain.py — lógica pura, sin DB ni I/O. Por
eso, a diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`: no hace falta la base de datos para
probar una función de decisión.

Casos idénticos a `reservas/tests/test_domain.py`/
`programacion/tests/test_domain.py` — misma función en comportamiento,
reimplementada acá deliberadamente (ver docstring de
`reservas_semestrales/domain.py`).
"""

import datetime

from reservas_semestrales.domain import dia_semana_de_fecha, hay_solapamiento


def _hora(h: int, m: int = 0) -> datetime.time:
    return datetime.time(h, m)


def test_franjas_identicas_se_solapan():
    assert hay_solapamiento(_hora(8), _hora(10), _hora(8), _hora(10)) is True


def test_franja_contenida_dentro_de_otra_se_solapa():
    assert hay_solapamiento(_hora(8), _hora(12), _hora(9), _hora(10)) is True


def test_franjas_parcialmente_superpuestas_se_solapan():
    assert hay_solapamiento(_hora(8), _hora(10), _hora(9), _hora(11)) is True


def test_franjas_adyacentes_no_se_solapan():
    # Una termina exactamente cuando empieza la otra: válido según el DDL
    # (hora_inicio < hora_fin en cada fila, sin exigir separación extra).
    assert hay_solapamiento(_hora(8), _hora(10), _hora(10), _hora(12)) is False


def test_franjas_completamente_separadas_no_se_solapan():
    assert hay_solapamiento(_hora(8), _hora(9), _hora(10), _hora(11)) is False


def test_solapamiento_es_simetrico():
    a_inicio, a_fin = _hora(9), _hora(11)
    b_inicio, b_fin = _hora(8), _hora(10)

    assert hay_solapamiento(a_inicio, a_fin, b_inicio, b_fin) == hay_solapamiento(
        b_inicio, b_fin, a_inicio, a_fin
    )


# ------------------------------------------------------------------
# dia_semana_de_fecha — necesaria para RF15 (validación cruzada): ver
# docstring de `service._validar_y_crear_franja` para el detalle del
# cruce "recurrente -> puntual" (esta franja recurrente contra las
# `ReservaIndividual` de fecha puntual dentro del rango del semestre).
# Mismo criterio de duplicación deliberada que `hay_solapamiento`.
# ------------------------------------------------------------------


def test_dia_semana_de_fecha_lunes():
    assert dia_semana_de_fecha(datetime.date(2026, 3, 9)) == "lunes"


def test_dia_semana_de_fecha_domingo():
    assert dia_semana_de_fecha(datetime.date(2026, 3, 15)) == "domingo"
