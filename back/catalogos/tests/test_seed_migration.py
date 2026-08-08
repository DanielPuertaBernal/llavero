"""
Test de la data migration de semilla (0002_seed_catalogos_iniciales):
verifica que produce exactamente las filas descritas en la sección
INSERTS del DDL, y que es idempotente (no duplica si se corre dos veces).

El nombre del módulo empieza con dígitos (convención de migraciones de
Django), así que no es un identificador Python válido para un
`import ... from ...` normal — se importa dinámicamente con importlib.
"""

import importlib

import pytest
from django.apps import apps as django_apps

from catalogos import repository

pytestmark = pytest.mark.django_db

_seed_module = importlib.import_module("catalogos.migrations.0002_seed_catalogos_iniciales")


def test_seed_crea_los_roles_del_ddl():
    _seed_module.sembrar_catalogos_iniciales(django_apps, None)

    assert {r.nombre for r in repository.listar_roles()} == {"admin", "auxiliar", "portero"}


def test_seed_crea_los_tipos_persona_del_ddl():
    _seed_module.sembrar_catalogos_iniciales(django_apps, None)

    assert {t.nombre for t in repository.listar_tipos_persona()} == {
        "docente",
        "estudiante",
        "empleado",
    }


def test_seed_crea_las_ubicaciones_del_ddl_con_sus_flags():
    _seed_module.sembrar_catalogos_iniciales(django_apps, None)

    oficina = repository.obtener_ubicacion_por_id(
        next(u.id for u in repository.listar_ubicaciones() if u.nombre == "Oficina principal")
    )
    porteria_superior = next(
        u for u in repository.listar_ubicaciones() if u.nombre == "Portería superior"
    )

    assert oficina.permite_prestamo_llaves is True
    assert oficina.permite_devolucion_llaves is True
    assert oficina.permite_prestamo_equipos is True

    assert porteria_superior.permite_prestamo_llaves is True
    assert porteria_superior.permite_devolucion_llaves is True
    assert porteria_superior.permite_prestamo_equipos is False


def test_seed_es_idempotente():
    _seed_module.sembrar_catalogos_iniciales(django_apps, None)
    _seed_module.sembrar_catalogos_iniciales(django_apps, None)

    assert len(repository.listar_roles()) == 3
    assert len(repository.listar_tipos_persona()) == 3
    assert len(repository.listar_ubicaciones()) == 3
