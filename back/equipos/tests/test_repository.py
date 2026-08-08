"""
Tests de equipos/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.
"""

import pytest
from django.db import IntegrityError

from equipos import repository
from equipos.model import EstadoEquipo

pytestmark = pytest.mark.django_db


# ------------------------------------------------------------------
# crear_equipo
# ------------------------------------------------------------------


def test_crear_equipo_lo_persiste_con_los_defaults_del_ddl():
    equipo = repository.crear_equipo(
        nombre="Proyector Epson", codigo_inventario="INV-001"
    )

    assert equipo.id is not None
    assert equipo.nombre == "Proyector Epson"
    assert equipo.marca is None
    assert equipo.codigo_inventario == "INV-001"
    assert equipo.codigo_barras is None
    assert equipo.estado == EstadoEquipo.ACTIVO


def test_crear_equipo_acepta_marca_codigo_barras_y_estado_explicitos():
    equipo = repository.crear_equipo(
        nombre="Control remoto",
        codigo_inventario="INV-002",
        marca="Samsung",
        codigo_barras="7501234567890",
        estado=EstadoEquipo.INACTIVO,
    )

    assert equipo.marca == "Samsung"
    assert equipo.codigo_barras == "7501234567890"
    assert equipo.estado == EstadoEquipo.INACTIVO


def test_crear_equipo_con_codigo_inventario_duplicado_falla_por_unicidad():
    repository.crear_equipo(nombre="Proyector Epson", codigo_inventario="INV-001")

    with pytest.raises(IntegrityError):
        repository.crear_equipo(nombre="Otro proyector", codigo_inventario="INV-001")


def test_crear_equipo_con_codigo_barras_duplicado_falla_por_unicidad():
    repository.crear_equipo(
        nombre="Proyector Epson", codigo_inventario="INV-001", codigo_barras="COD-1"
    )

    with pytest.raises(IntegrityError):
        repository.crear_equipo(
            nombre="Otro proyector", codigo_inventario="INV-002", codigo_barras="COD-1"
        )


def test_crear_equipo_permite_varios_equipos_sin_codigo_barras():
    # codigo_barras es UNIQUE pero nullable en el DDL: Postgres trata
    # varios NULL como valores distintos, no como duplicados.
    repository.crear_equipo(nombre="Equipo A", codigo_inventario="INV-001")
    repository.crear_equipo(nombre="Equipo B", codigo_inventario="INV-002")

    assert len(repository.listar_equipos()) == 2


def test_crear_equipo_con_estado_invalido_falla_por_check_constraint():
    # A diferencia de los FK (DEFERRABLE INITIALLY DEFERRED), un CHECK
    # constraint de Postgres no es deferrable: se evalúa en el INSERT.
    with pytest.raises(IntegrityError):
        repository.crear_equipo(
            nombre="Equipo roto", codigo_inventario="INV-999", estado="rota"
        )


# ------------------------------------------------------------------
# listar / obtener
# ------------------------------------------------------------------


def test_listar_equipos():
    repository.crear_equipo(nombre="Equipo A", codigo_inventario="INV-001")
    repository.crear_equipo(nombre="Equipo B", codigo_inventario="INV-002")

    assert {e.nombre for e in repository.listar_equipos()} == {"Equipo A", "Equipo B"}


def test_obtener_equipo_por_id():
    creado = repository.crear_equipo(nombre="Equipo A", codigo_inventario="INV-001")

    assert repository.obtener_equipo_por_id(creado.id).nombre == "Equipo A"


def test_obtener_equipo_por_id_inexistente_devuelve_none():
    assert repository.obtener_equipo_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_equipo_por_codigo_inventario():
    creado = repository.crear_equipo(nombre="Equipo A", codigo_inventario="INV-001")

    assert repository.obtener_equipo_por_codigo_inventario("INV-001").id == creado.id


def test_obtener_equipo_por_codigo_inventario_inexistente_devuelve_none():
    assert repository.obtener_equipo_por_codigo_inventario("NO-EXISTE") is None


def test_obtener_equipo_por_codigo_barras():
    creado = repository.crear_equipo(
        nombre="Equipo A", codigo_inventario="INV-001", codigo_barras="COD-1"
    )

    assert repository.obtener_equipo_por_codigo_barras("COD-1").id == creado.id


def test_listar_equipos_por_estado():
    repository.crear_equipo(nombre="Activo", codigo_inventario="INV-001")
    repository.crear_equipo(
        nombre="Inactivo", codigo_inventario="INV-002", estado=EstadoEquipo.INACTIVO
    )

    activos = [e.nombre for e in repository.listar_equipos_por_estado(EstadoEquipo.ACTIVO)]
    inactivos = [e.nombre for e in repository.listar_equipos_por_estado(EstadoEquipo.INACTIVO)]

    assert activos == ["Activo"]
    assert inactivos == ["Inactivo"]
