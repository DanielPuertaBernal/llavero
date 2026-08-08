"""
Tests de programacion/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`: no hace falta la base de datos para
probar una función de decisión.
"""

import datetime

from programacion.domain import hay_solapamiento


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
