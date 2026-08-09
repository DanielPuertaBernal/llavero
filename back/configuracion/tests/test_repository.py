"""
Tests de configuracion/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención TDD
del proyecto.

El fixture de ubicacion que necesita configuracion (FK NOT NULL) se crea
vía `catalogos.service` (la API pública de ese módulo), nunca vía
`catalogos.repository`/`catalogos.model` — la regla dura de módulos
("configuracion solo puede importar catalogos.service") aplica también
acá, no solo en el código de producción.
"""

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from configuracion import repository

pytestmark = pytest.mark.django_db


def _ubicacion(nombre="ubicacion-test-configuracion-repo"):
    return catalogos_service.crear_ubicacion(nombre)


# ------------------------------------------------------------------
# obtener_configuracion
# ------------------------------------------------------------------


def test_obtener_configuracion_devuelve_none_si_no_hay_fila():
    assert repository.obtener_configuracion() is None


def test_obtener_configuracion_devuelve_la_fila_existente():
    ubicacion = _ubicacion()
    creada = repository.crear_configuracion(ubicacion.id)

    assert repository.obtener_configuracion().id == creada.id


# ------------------------------------------------------------------
# crear_configuracion
# ------------------------------------------------------------------


def test_crear_configuracion_usa_los_defaults_del_ddl():
    ubicacion = _ubicacion()

    configuracion = repository.crear_configuracion(ubicacion.id)

    assert configuracion.id is not None
    assert configuracion.limite_antes_mora_minutos == 120
    assert configuracion.max_reintentos_recordatorio == 3
    assert configuracion.plantilla_recordatorio is None
    assert configuracion.ubicacion_defecto_id == ubicacion.id
    assert configuracion.limite_no_reclamada_minutos == 30


def test_crear_configuracion_acepta_valores_explicitos():
    ubicacion = _ubicacion()

    configuracion = repository.crear_configuracion(
        ubicacion.id,
        limite_antes_mora_minutos=60,
        max_reintentos_recordatorio=5,
        plantilla_recordatorio="Recuerda devolver la llave",
        limite_no_reclamada_minutos=45,
    )

    assert configuracion.limite_antes_mora_minutos == 60
    assert configuracion.max_reintentos_recordatorio == 5
    assert configuracion.plantilla_recordatorio == "Recuerda devolver la llave"
    assert configuracion.limite_no_reclamada_minutos == 45


def test_crear_configuracion_con_ubicacion_inexistente_falla_por_fk():
    # Postgres declara los FK de Django DEFERRABLE INITIALLY DEFERRED, así
    # que el INSERT en sí no falla — el chequeo real ocurre en
    # check_constraints() (Django lo llama recién al hacer rollback del
    # test). Se fuerza aquí para no depender del orden de teardown (ver
    # catalogos/tests/test_repository.py::test_crear_salon_con_bloque_inexistente_falla_por_fk).
    with pytest.raises(IntegrityError):
        repository.crear_configuracion("00000000-0000-0000-0000-000000000000")
        connection.check_constraints()


# ------------------------------------------------------------------
# actualizar_configuracion
# ------------------------------------------------------------------


def test_actualizar_configuracion_reemplaza_los_campos():
    ubicacion = _ubicacion()
    otra_ubicacion = _ubicacion("ubicacion-test-configuracion-repo-2")
    creada = repository.crear_configuracion(ubicacion.id)

    actualizada = repository.actualizar_configuracion(
        creada.id,
        otra_ubicacion.id,
        limite_antes_mora_minutos=90,
        max_reintentos_recordatorio=1,
        plantilla_recordatorio="Nueva plantilla",
        limite_no_reclamada_minutos=45,
    )

    assert actualizada.ubicacion_defecto_id == otra_ubicacion.id
    assert actualizada.limite_antes_mora_minutos == 90
    assert actualizada.max_reintentos_recordatorio == 1
    assert actualizada.plantilla_recordatorio == "Nueva plantilla"
    assert actualizada.limite_no_reclamada_minutos == 45

    persistida = repository.obtener_configuracion()
    assert persistida.limite_antes_mora_minutos == 90
    assert persistida.limite_no_reclamada_minutos == 45


def test_actualizar_configuracion_inexistente_devuelve_none():
    ubicacion = _ubicacion()

    assert (
        repository.actualizar_configuracion(
            "00000000-0000-0000-0000-000000000000",
            ubicacion.id,
            limite_antes_mora_minutos=90,
            max_reintentos_recordatorio=1,
            plantilla_recordatorio=None,
        )
        is None
    )
