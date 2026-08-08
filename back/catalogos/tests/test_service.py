"""
Tests de catalogos/service.py — solo la lógica que agrega valor sobre el
repository (la validación de FKs de crear_salon). El resto de funciones
del service son passthrough directo a repository y ya están cubiertas
transitivamente por test_repository.py.
"""

import pytest

from catalogos import repository, service

pytestmark = pytest.mark.django_db


def test_crear_salon_con_bloque_inexistente_da_value_error_claro():
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")

    with pytest.raises(ValueError, match="bloque"):
        service.crear_salon("101", "00000000-0000-0000-0000-000000000000", tipo_silleteria.id)


def test_crear_salon_con_tipo_silleteria_inexistente_da_value_error_claro():
    bloque = repository.crear_bloque("Bloque 12")

    with pytest.raises(ValueError, match="tipo_silleteria"):
        service.crear_salon("101", bloque.id, "00000000-0000-0000-0000-000000000000")


def test_crear_salon_con_referencias_validas_delega_al_repository():
    bloque = repository.crear_bloque("Bloque 12")
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")

    salon = service.crear_salon("101", bloque.id, tipo_silleteria.id)

    assert salon.bloque_id == bloque.id
    assert salon.tipo_silleteria_id == tipo_silleteria.id


def test_obtener_rol_inexistente_devuelve_none():
    assert service.obtener_rol("00000000-0000-0000-0000-000000000000") is None


def test_obtener_rol_existente_lo_devuelve():
    # "admin" ya existe por el seed (0002_seed_catalogos_iniciales);
    # se usa un nombre propio del test para no depender de esa fila.
    creado = repository.crear_rol("coordinador")

    assert service.obtener_rol(creado.id).id == creado.id
