"""
Tests de prestamos/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`.
"""

import pytest

from prestamos.domain import (
    todos_devueltos,
    validar_equipo_disponible,
    validar_permite_prestamo,
)


def test_validar_permite_prestamo_con_true_no_lanza():
    validar_permite_prestamo(True)


def test_validar_permite_prestamo_con_false_lanza_value_error():
    with pytest.raises(ValueError, match="préstamo"):
        validar_permite_prestamo(False)


def test_validar_equipo_disponible_con_false_no_lanza():
    validar_equipo_disponible("equipo-1", False)


def test_validar_equipo_disponible_con_true_lanza_value_error_con_el_id():
    with pytest.raises(ValueError, match="equipo-1"):
        validar_equipo_disponible("equipo-1", True)


def test_todos_devueltos_con_lista_vacia_es_false():
    assert todos_devueltos([]) is False


def test_todos_devueltos_con_todos_devuelto_es_true():
    assert todos_devueltos(["devuelto", "devuelto"]) is True


def test_todos_devueltos_con_alguno_entregado_es_false():
    assert todos_devueltos(["devuelto", "entregado"]) is False


def test_todos_devueltos_con_todos_entregado_es_false():
    assert todos_devueltos(["entregado", "entregado"]) is False
