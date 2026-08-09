"""
Tests de nfc/domain.py — lógica pura (sin DB, sin I/O), no necesita
`pytest.mark.django_db`.
"""

import datetime

from nfc import domain


# ------------------------------------------------------------------
# dia_semana_actual
# ------------------------------------------------------------------


def test_dia_semana_actual_lunes():
    # 2026-03-09 es lunes (verificado con datetime.date.weekday()).
    assert domain.dia_semana_actual(datetime.date(2026, 3, 9)) == "lunes"


def test_dia_semana_actual_martes():
    assert domain.dia_semana_actual(datetime.date(2026, 3, 10)) == "martes"


def test_dia_semana_actual_domingo():
    # 2026-03-15 es domingo (6 días después del lunes 2026-03-09).
    assert domain.dia_semana_actual(datetime.date(2026, 3, 15)) == "domingo"


def test_dia_semana_actual_devuelve_uno_de_los_7_valores_del_proyecto():
    dias_obtenidos = {
        domain.dia_semana_actual(datetime.date(2026, 3, 9) + datetime.timedelta(days=i))
        for i in range(7)
    }
    assert dias_obtenidos == set(domain.DIAS_SEMANA)


def test_dia_semana_actual_acepta_datetime_con_hora():
    # datetime.datetime también tiene .weekday(), no solo datetime.date.
    ahora = datetime.datetime(2026, 3, 9, 14, 30)
    assert domain.dia_semana_actual(ahora) == "lunes"


# ------------------------------------------------------------------
# hora_dentro_de_franja
# ------------------------------------------------------------------


def test_hora_dentro_de_franja_dentro_del_rango():
    assert domain.hora_dentro_de_franja(
        datetime.time(9, 0), datetime.time(8, 0), datetime.time(10, 0)
    ) is True


def test_hora_dentro_de_franja_igual_al_inicio_es_inclusivo():
    assert domain.hora_dentro_de_franja(
        datetime.time(8, 0), datetime.time(8, 0), datetime.time(10, 0)
    ) is True


def test_hora_dentro_de_franja_igual_al_fin_es_exclusivo():
    assert domain.hora_dentro_de_franja(
        datetime.time(10, 0), datetime.time(8, 0), datetime.time(10, 0)
    ) is False


def test_hora_dentro_de_franja_antes_del_inicio_es_false():
    assert domain.hora_dentro_de_franja(
        datetime.time(7, 59), datetime.time(8, 0), datetime.time(10, 0)
    ) is False


def test_hora_dentro_de_franja_despues_del_fin_es_false():
    assert domain.hora_dentro_de_franja(
        datetime.time(10, 1), datetime.time(8, 0), datetime.time(10, 0)
    ) is False
