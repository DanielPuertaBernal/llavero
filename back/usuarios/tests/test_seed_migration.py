"""
Test de la data migration de semilla (0002_seed_superusuario_inicial):
verifica que crea el usuario admin inicial a partir de
`settings.SUPERUSUARIO_EMAIL`, que no hace nada si esa variable está vacía,
y que es idempotente (no duplica ni falla si el email ya existe).

El nombre del módulo empieza con dígitos (convención de migraciones de
Django), así que no es un identificador Python válido para un
`import ... from ...` normal — se importa dinámicamente con importlib.
"""

import importlib

import pytest
from django.apps import apps as django_apps
from django.test import override_settings

from usuarios import repository

pytestmark = pytest.mark.django_db

_seed_module = importlib.import_module("usuarios.migrations.0002_seed_superusuario_inicial")


@override_settings(SUPERUSUARIO_EMAIL="admin@uco.edu.co")
def test_seed_crea_el_usuario_admin_con_el_email_configurado():
    _seed_module.sembrar_superusuario_inicial(django_apps, None)

    usuario = repository.obtener_usuario_por_email("admin@uco.edu.co")

    assert usuario is not None
    assert usuario.rol.nombre == "admin"
    assert usuario.ubicacion.nombre == "Oficina principal"
    assert usuario.oid_microsoft is None
    assert usuario.activo is True


@override_settings(SUPERUSUARIO_EMAIL="")
def test_seed_no_crea_nada_si_la_variable_esta_vacia():
    # No se compara contra una lista vacía: al construir la base de test,
    # pytest-django corre TODAS las migraciones (incluida esta, con el
    # SUPERUSUARIO_EMAIL real del .env si está configurado), así que puede
    # haber usuarios base ya sembrados por esa corrida inicial. Lo que
    # importa acá es que esta llamada puntual, con la variable vacía, no
    # agrega ninguno nuevo — se compara por delta, no por total absoluto.
    cantidad_antes = len(repository.listar_usuarios())

    _seed_module.sembrar_superusuario_inicial(django_apps, None)

    assert len(repository.listar_usuarios()) == cantidad_antes


@override_settings(SUPERUSUARIO_EMAIL="admin-idempotencia@uco.edu.co")
def test_seed_es_idempotente():
    cantidad_antes = len(repository.listar_usuarios())

    _seed_module.sembrar_superusuario_inicial(django_apps, None)
    _seed_module.sembrar_superusuario_inicial(django_apps, None)

    assert len(repository.listar_usuarios()) == cantidad_antes + 1
