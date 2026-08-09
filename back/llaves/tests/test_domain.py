"""
Tests de llaves/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`.
"""

import datetime

import pytest

from llaves.domain import (
    es_mora,
    validar_permite_devolucion,
    validar_permite_prestamo,
)


def test_validar_permite_prestamo_con_true_no_lanza():
    validar_permite_prestamo(True)


def test_validar_permite_prestamo_con_false_lanza_value_error():
    with pytest.raises(ValueError, match="entrega"):
        validar_permite_prestamo(False)


def test_validar_permite_devolucion_con_true_no_lanza():
    validar_permite_devolucion(True)


def test_validar_permite_devolucion_con_false_lanza_value_error():
    with pytest.raises(ValueError, match="devolución"):
        validar_permite_devolucion(False)


# ------------------------------------------------------------------
# es_mora
# ------------------------------------------------------------------


def test_es_mora_exactamente_en_el_limite_es_false():
    entrega = datetime.datetime(2026, 1, 1, 8, 0, tzinfo=datetime.timezone.utc)
    ahora = datetime.datetime(2026, 1, 1, 8, 30, tzinfo=datetime.timezone.utc)

    assert es_mora(entrega, 30, ahora) is False


def test_es_mora_un_segundo_despues_del_limite_es_true():
    entrega = datetime.datetime(2026, 1, 1, 8, 0, tzinfo=datetime.timezone.utc)
    ahora = datetime.datetime(2026, 1, 1, 8, 30, 1, tzinfo=datetime.timezone.utc)

    assert es_mora(entrega, 30, ahora) is True


def test_es_mora_antes_del_limite_es_false():
    entrega = datetime.datetime(2026, 1, 1, 8, 0, tzinfo=datetime.timezone.utc)
    ahora = datetime.datetime(2026, 1, 1, 8, 15, tzinfo=datetime.timezone.utc)

    assert es_mora(entrega, 30, ahora) is False
