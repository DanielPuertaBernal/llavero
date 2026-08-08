"""
Tests de equipos/service.py — la API pública que consumirá el futuro
módulo `prestamos`. Los passthrough directos a repository ya están
cubiertos transitivamente por test_repository.py; acá se prueba el valor
agregado propio del service (filtros de conveniencia, contrato
obtener_* -> None).
"""

import pytest

from equipos import repository, service
from equipos.model import EstadoEquipo

pytestmark = pytest.mark.django_db


def test_obtener_equipo_inexistente_devuelve_none():
    assert service.obtener_equipo("00000000-0000-0000-0000-000000000000") is None


def test_obtener_equipo_existente_lo_devuelve():
    creado = repository.crear_equipo(nombre="Equipo A", codigo_inventario="INV-001")

    assert service.obtener_equipo(creado.id).id == creado.id


def test_crear_equipo_delega_al_repository():
    equipo = service.crear_equipo(nombre="Equipo A", codigo_inventario="INV-001")

    assert equipo.codigo_inventario == "INV-001"
    assert equipo.estado == EstadoEquipo.ACTIVO


def test_listar_equipos_activos_excluye_inactivos():
    repository.crear_equipo(nombre="Activo", codigo_inventario="INV-001")
    repository.crear_equipo(
        nombre="Inactivo", codigo_inventario="INV-002", estado=EstadoEquipo.INACTIVO
    )

    nombres = [e.nombre for e in service.listar_equipos_activos()]

    assert nombres == ["Activo"]


def test_obtener_equipo_por_codigo_inventario_inexistente_devuelve_none():
    assert service.obtener_equipo_por_codigo_inventario("NO-EXISTE") is None


def test_obtener_equipo_por_codigo_barras_existente_lo_devuelve():
    creado = repository.crear_equipo(
        nombre="Equipo A", codigo_inventario="INV-001", codigo_barras="COD-1"
    )

    assert service.obtener_equipo_por_codigo_barras("COD-1").id == creado.id
