"""
Tests de llaves/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`.
"""

import pytest

from llaves.domain import validar_permite_devolucion, validar_permite_prestamo


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
