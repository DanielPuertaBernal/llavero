"""
Tests de comunidad/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

El fixture de tipo_persona que necesita comunidad (FK NOT NULL) se crea
vía `catalogos.service` (la API pública de ese módulo), nunca vía
`catalogos.repository`/`catalogos.model` — la regla dura de módulos
("comunidad solo puede importar catalogos.service") aplica también acá,
no solo en el código de producción.
"""

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from comunidad import repository

pytestmark = pytest.mark.django_db


def _tipo_persona(nombre="tipo-test-comunidad-repo"):
    return catalogos_service.crear_tipo_persona(nombre)


# ------------------------------------------------------------------
# crear_persona
# ------------------------------------------------------------------


def test_crear_persona_la_persiste_con_los_datos_dados():
    tipo_persona = _tipo_persona()

    persona = repository.crear_persona(
        "1000123456", "Ana Pérez", tipo_persona.id, id_carnet="CARNET-1"
    )

    assert persona.id is not None
    assert persona.numero_documento == "1000123456"
    assert persona.nombre == "Ana Pérez"
    assert persona.tipo_persona_id == tipo_persona.id
    assert persona.id_carnet == "CARNET-1"
    assert persona.correo is None
    assert persona.numero_contacto is None
    assert persona.facultad is None


def test_crear_persona_acepta_todos_los_campos_opcionales():
    tipo_persona = _tipo_persona()

    persona = repository.crear_persona(
        "1000123456",
        "Ana Pérez",
        tipo_persona.id,
        id_carnet="CARNET-1",
        correo="ana.perez@uco.edu.co",
        numero_contacto="3001234567",
        facultad="Ingeniería",
    )

    assert persona.correo == "ana.perez@uco.edu.co"
    assert persona.numero_contacto == "3001234567"
    assert persona.facultad == "Ingeniería"


def test_crear_persona_sin_carnet_queda_con_id_carnet_none():
    tipo_persona = _tipo_persona()

    persona = repository.crear_persona("1000123456", "Ana Pérez", tipo_persona.id)

    assert persona.id_carnet is None


def test_crear_persona_con_numero_documento_duplicado_falla_por_unicidad():
    tipo_persona = _tipo_persona()
    repository.crear_persona("1000123456", "Ana Pérez", tipo_persona.id)

    with pytest.raises(IntegrityError):
        repository.crear_persona("1000123456", "Otra Ana", tipo_persona.id)


def test_crear_persona_con_tipo_persona_inexistente_falla_por_fk():
    # Postgres declara los FK de Django DEFERRABLE INITIALLY DEFERRED, así
    # que el INSERT en sí no falla — el chequeo real ocurre en
    # check_constraints() (Django lo llama recién al hacer rollback del
    # test). Se fuerza aquí para no depender del orden de teardown (ver
    # catalogos/tests/test_repository.py::test_crear_salon_con_bloque_inexistente_falla_por_fk).
    with pytest.raises(IntegrityError):
        repository.crear_persona(
            "1000123456",
            "Ana Pérez",
            "00000000-0000-0000-0000-000000000000",
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# unicidad condicional de id_carnet (WHERE id_carnet IS NOT NULL)
# ------------------------------------------------------------------


def test_dos_personas_con_id_carnet_none_conviven_sin_problema():
    # Corrección deliberada de un bug real del legacy (ver model.py):
    # el índice único es PARCIAL, así que cualquier cantidad de filas con
    # id_carnet=None debe poder coexistir sin chocar.
    tipo_persona = _tipo_persona()

    p1 = repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)
    p2 = repository.crear_persona("1000000002", "Persona Dos", tipo_persona.id)

    assert p1.id_carnet is None
    assert p2.id_carnet is None
    assert p1.id != p2.id


def test_dos_personas_con_el_mismo_id_carnet_no_nulo_chocan():
    tipo_persona = _tipo_persona()
    repository.crear_persona(
        "1000000001", "Persona Uno", tipo_persona.id, id_carnet="CARNET-DUP"
    )

    with pytest.raises(IntegrityError):
        repository.crear_persona(
            "1000000002", "Persona Dos", tipo_persona.id, id_carnet="CARNET-DUP"
        )


# ------------------------------------------------------------------
# listar / obtener
# ------------------------------------------------------------------


def test_listar_comunidad():
    tipo_persona = _tipo_persona()
    repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)
    repository.crear_persona("1000000002", "Persona Dos", tipo_persona.id)

    nombres = {p.nombre for p in repository.listar_comunidad()}

    assert {"Persona Uno", "Persona Dos"} <= nombres


def test_obtener_por_id():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)

    assert repository.obtener_por_id(creada.id).nombre == "Persona Uno"


def test_obtener_por_id_inexistente_devuelve_none():
    assert repository.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_documento():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)

    assert repository.obtener_por_documento("1000000001").id == creada.id


def test_obtener_por_documento_inexistente_devuelve_none():
    assert repository.obtener_por_documento("no-existe") is None


def test_obtener_por_carnet():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona(
        "1000000001", "Persona Uno", tipo_persona.id, id_carnet="CARNET-1"
    )

    assert repository.obtener_por_carnet("CARNET-1").id == creada.id


def test_obtener_por_carnet_inexistente_devuelve_none():
    assert repository.obtener_por_carnet("no-existe") is None


# ------------------------------------------------------------------
# actualizar_persona
# ------------------------------------------------------------------


def test_actualizar_persona_reemplaza_los_campos_editables():
    tipo_persona = _tipo_persona()
    otro_tipo_persona = _tipo_persona("tipo-test-comunidad-repo-2")
    creada = repository.crear_persona(
        "1000000001", "Persona Uno", tipo_persona.id, id_carnet="CARNET-1"
    )

    actualizada = repository.actualizar_persona(
        creada.id,
        "Persona Uno Actualizada",
        otro_tipo_persona.id,
        id_carnet="CARNET-2",
        correo="p1@uco.edu.co",
        numero_contacto="3009999999",
        facultad="Ciencias",
    )

    assert actualizada.nombre == "Persona Uno Actualizada"
    assert actualizada.tipo_persona_id == otro_tipo_persona.id
    assert actualizada.id_carnet == "CARNET-2"
    assert actualizada.correo == "p1@uco.edu.co"
    assert actualizada.numero_contacto == "3009999999"
    assert actualizada.facultad == "Ciencias"
    # numero_documento no es editable por este método (clave natural).
    assert actualizada.numero_documento == "1000000001"

    persistida = repository.obtener_por_id(creada.id)
    assert persistida.nombre == "Persona Uno Actualizada"
    assert persistida.id_carnet == "CARNET-2"


def test_actualizar_persona_inexistente_devuelve_none():
    tipo_persona = _tipo_persona()

    assert (
        repository.actualizar_persona(
            "00000000-0000-0000-0000-000000000000", "X", tipo_persona.id
        )
        is None
    )


# ------------------------------------------------------------------
# eliminar_persona
# ------------------------------------------------------------------


def test_eliminar_persona_existente_la_borra_y_devuelve_true():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)

    assert repository.eliminar_persona(creada.id) is True
    assert repository.obtener_por_id(creada.id) is None


def test_eliminar_persona_inexistente_devuelve_false():
    assert repository.eliminar_persona("00000000-0000-0000-0000-000000000000") is False
