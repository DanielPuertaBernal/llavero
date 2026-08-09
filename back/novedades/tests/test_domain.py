"""
Tests de novedades/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`.
"""

import pytest

from novedades.domain import validar_cierre


def test_validar_cierre_con_solucion_no_lanza():
    validar_cierre("Se repuso la llave con el proveedor habitual")


def test_validar_cierre_con_solucion_none_lanza_value_error():
    with pytest.raises(ValueError, match="solución"):
        validar_cierre(None)


def test_validar_cierre_con_solucion_vacia_lanza_value_error():
    with pytest.raises(ValueError, match="solución"):
        validar_cierre("")


def test_validar_cierre_con_solucion_solo_espacios_lanza_value_error():
    with pytest.raises(ValueError, match="solución"):
        validar_cierre("   ")
