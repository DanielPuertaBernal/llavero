"""
Tests de disponibilidad/domain.py — lógica pura (sin DB), sin mocks
necesarios: `hay_solapamiento`/`dia_semana_de_fecha` no tocan la base de
datos, ver docstring de domain.py.
"""

import datetime

from disponibilidad import domain


# ------------------------------------------------------------------
# hay_solapamiento
# ------------------------------------------------------------------


def test_hay_solapamiento_con_franjas_que_se_cruzan_da_true():
    assert domain.hay_solapamiento(
        datetime.time(8, 0), datetime.time(10, 0),
        datetime.time(9, 0), datetime.time(11, 0),
    ) is True


def test_hay_solapamiento_con_franjas_adyacentes_da_false():
    assert domain.hay_solapamiento(
        datetime.time(8, 0), datetime.time(10, 0),
        datetime.time(10, 0), datetime.time(12, 0),
    ) is False


def test_hay_solapamiento_con_franjas_disjuntas_da_false():
    assert domain.hay_solapamiento(
        datetime.time(8, 0), datetime.time(9, 0),
        datetime.time(10, 0), datetime.time(11, 0),
    ) is False


def test_hay_solapamiento_con_una_franja_contenida_en_la_otra_da_true():
    assert domain.hay_solapamiento(
        datetime.time(8, 0), datetime.time(12, 0),
        datetime.time(9, 0), datetime.time(10, 0),
    ) is True


# ------------------------------------------------------------------
# dia_semana_de_fecha
# ------------------------------------------------------------------


def test_dia_semana_de_fecha_lunes():
    assert domain.dia_semana_de_fecha(datetime.date(2026, 3, 9)) == "lunes"


def test_dia_semana_de_fecha_domingo():
    assert domain.dia_semana_de_fecha(datetime.date(2026, 3, 15)) == "domingo"


def test_dias_semana_tiene_los_siete_valores_en_orden():
    assert domain.DIAS_SEMANA == [
        "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
    ]
