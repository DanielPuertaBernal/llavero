"""
Tests de usuarios/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`: no hace falta la base de datos para
probar una función de decisión.
"""

import pytest

from usuarios.domain import AutodesactivacionError, validar_desactivacion


def test_validar_desactivacion_permite_desactivar_a_otro_usuario():
    # No debe lanzar nada.
    validar_desactivacion(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
    )


def test_validar_desactivacion_no_permite_autodesactivarse():
    usuario_id = "11111111-1111-1111-1111-111111111111"

    with pytest.raises(AutodesactivacionError):
        validar_desactivacion(usuario_id, usuario_id)


def test_validar_desactivacion_compara_por_valor_no_por_identidad_de_objeto():
    # Los ids llegan como UUID (del ORM) o str (de un payload HTTP) según
    # quién llame; la función debe reconocer que son "el mismo usuario"
    # sin importar el tipo concreto que traiga cada uno.
    import uuid

    usuario_id = uuid.uuid4()

    with pytest.raises(AutodesactivacionError):
        validar_desactivacion(usuario_id, str(usuario_id))
