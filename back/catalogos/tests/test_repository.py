"""
Tests de catalogos/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.
"""

import pytest
from django.db import IntegrityError, connection

from catalogos import repository

pytestmark = pytest.mark.django_db


# ------------------------------------------------------------------
# Rol
# ------------------------------------------------------------------


def test_crear_rol_lo_persiste_y_lo_hace_listable():
    # No usar nombres de los 3 roles que ya trae la migración de seed
    # (admin/auxiliar/portero, ver 0002_seed_catalogos_iniciales) —
    # correrían contra la BD real de test, donde ya existen.
    rol = repository.crear_rol("coordinador")

    assert rol.id is not None
    assert rol.nombre == "coordinador"
    assert "coordinador" in [r.nombre for r in repository.listar_roles()]


def test_crear_rol_con_nombre_duplicado_falla_por_unicidad():
    repository.crear_rol("coordinador")

    with pytest.raises(IntegrityError):
        repository.crear_rol("coordinador")


def test_obtener_rol_por_id_y_por_nombre():
    creado = repository.crear_rol("vigilante")

    assert repository.obtener_rol_por_id(creado.id).nombre == "vigilante"
    assert repository.obtener_rol_por_nombre("vigilante").id == creado.id


def test_obtener_rol_por_id_inexistente_devuelve_none():
    assert repository.obtener_rol_por_id("00000000-0000-0000-0000-000000000000") is None


# ------------------------------------------------------------------
# TipoPersona
# ------------------------------------------------------------------


def test_crear_tipo_persona_lo_persiste_y_lo_hace_listable():
    # Evita los 3 tipos que ya trae el seed (docente/estudiante/empleado).
    repository.crear_tipo_persona("contratista")

    assert "contratista" in [t.nombre for t in repository.listar_tipos_persona()]


def test_crear_tipo_persona_con_nombre_duplicado_falla_por_unicidad():
    repository.crear_tipo_persona("contratista")

    with pytest.raises(IntegrityError):
        repository.crear_tipo_persona("contratista")


def test_obtener_tipo_persona_por_nombre():
    creado = repository.crear_tipo_persona("pasante")

    assert repository.obtener_tipo_persona_por_nombre("pasante").id == creado.id


# ------------------------------------------------------------------
# Ubicacion
# ------------------------------------------------------------------


def test_crear_ubicacion_usa_los_defaults_del_ddl():
    ubicacion = repository.crear_ubicacion("Oficina principal")

    assert ubicacion.permite_prestamo_llaves is True
    assert ubicacion.permite_devolucion_llaves is True
    assert ubicacion.permite_prestamo_equipos is False


def test_crear_ubicacion_permite_nombres_repetidos_no_es_unico():
    # A diferencia de rol/tipo_persona/bloque/tipo_silleteria, el DDL no
    # marca ubicacion.nombre como UNIQUE. Nombre distinto a las 3 que ya
    # trae el seed (Oficina principal / Portería superior / Portería
    # inferior) para no mezclar conteos con esas filas.
    repository.crear_ubicacion("Sala de pruebas")
    repository.crear_ubicacion("Sala de pruebas")

    coincidencias = [u for u in repository.listar_ubicaciones() if u.nombre == "Sala de pruebas"]
    assert len(coincidencias) == 2


def test_listar_ubicaciones_que_permiten_prestamo_llaves():
    repository.crear_ubicacion("Sala de pruebas", permite_prestamo_llaves=True)
    repository.crear_ubicacion(
        "Bodega",
        permite_prestamo_llaves=False,
        permite_devolucion_llaves=False,
        permite_prestamo_equipos=False,
    )

    resultado = [u.nombre for u in repository.listar_ubicaciones_que_permiten_prestamo_llaves()]

    assert "Sala de pruebas" in resultado
    assert "Bodega" not in resultado


# ------------------------------------------------------------------
# Bloque
# ------------------------------------------------------------------


def test_crear_bloque_lo_persiste_y_lo_hace_listable():
    repository.crear_bloque("Bloque 12")

    assert [b.nombre for b in repository.listar_bloques()] == ["Bloque 12"]


def test_crear_bloque_con_nombre_duplicado_falla_por_unicidad():
    repository.crear_bloque("Bloque 12")

    with pytest.raises(IntegrityError):
        repository.crear_bloque("Bloque 12")


def test_obtener_bloque_por_nombre():
    creado = repository.crear_bloque("Bloque 12")

    assert repository.obtener_bloque_por_nombre("Bloque 12").id == creado.id


# ------------------------------------------------------------------
# TipoSilleteria
# ------------------------------------------------------------------


def test_crear_tipo_silleteria_lo_persiste_y_lo_hace_listable():
    repository.crear_tipo_silleteria("Individual")

    assert [t.nombre for t in repository.listar_tipos_silleteria()] == ["Individual"]


def test_crear_tipo_silleteria_con_nombre_duplicado_falla_por_unicidad():
    repository.crear_tipo_silleteria("Individual")

    with pytest.raises(IntegrityError):
        repository.crear_tipo_silleteria("Individual")


# ------------------------------------------------------------------
# Salon
# ------------------------------------------------------------------


def test_crear_salon_lo_persiste_con_sus_fk_y_defaults():
    bloque = repository.crear_bloque("Bloque 12")
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")

    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    assert salon.nombre == "101"
    assert salon.bloque_id == bloque.id
    assert salon.tipo_silleteria_id == tipo_silleteria.id
    assert salon.cantidad_sillas == 0
    assert salon.cantidad_mesas == 0


def test_crear_salon_con_nombre_y_bloque_duplicados_falla_por_unicidad():
    bloque = repository.crear_bloque("Bloque 12")
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")
    repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    with pytest.raises(IntegrityError):
        repository.crear_salon("101", bloque.id, tipo_silleteria.id)


def test_crear_salon_mismo_nombre_en_otro_bloque_si_es_valido():
    bloque_1 = repository.crear_bloque("Bloque 12")
    bloque_2 = repository.crear_bloque("Bloque 13")
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")

    repository.crear_salon("101", bloque_1.id, tipo_silleteria.id)
    salon_en_otro_bloque = repository.crear_salon("101", bloque_2.id, tipo_silleteria.id)

    assert salon_en_otro_bloque.nombre == "101"


def test_listar_salones_por_bloque():
    bloque_1 = repository.crear_bloque("Bloque 12")
    bloque_2 = repository.crear_bloque("Bloque 13")
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")
    repository.crear_salon("101", bloque_1.id, tipo_silleteria.id)
    repository.crear_salon("201", bloque_2.id, tipo_silleteria.id)

    resultado = repository.listar_salones_por_bloque(bloque_1.id)

    assert [s.nombre for s in resultado] == ["101"]


def test_crear_salon_con_bloque_inexistente_falla_por_fk():
    # Postgres declara los FK de Django DEFERRABLE INITIALLY DEFERRED, así
    # que el INSERT en sí no falla — el chequeo real ocurre en
    # check_constraints() (Django lo llama recién al hacer rollback del
    # test). Se fuerza aquí para no depender del orden de teardown.
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")

    with pytest.raises(IntegrityError):
        repository.crear_salon(
            "101", "00000000-0000-0000-0000-000000000000", tipo_silleteria.id
        )
        connection.check_constraints()
