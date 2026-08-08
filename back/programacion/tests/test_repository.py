"""
Tests de programacion/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

Los fixtures cross-módulo (salon, docente) se crean vía la API pública de
cada módulo (`catalogos.service`, `comunidad.service`), nunca vía sus
`repository`/`model` — la regla dura de módulos aplica también en tests
(ver comunidad/tests/test_repository.py).
"""

import datetime

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import repository
from programacion.model import DiaSemana

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _docente(numero_documento="1000000001"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, "Docente Prueba", tipo_persona.id)


def _semestre(codigo="2026-1"):
    return repository.crear_semestre(
        codigo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )


# ------------------------------------------------------------------
# Semestre
# ------------------------------------------------------------------


def test_crear_semestre_lo_persiste_y_lo_hace_listable():
    semestre = repository.crear_semestre(
        "2026-1", datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert semestre.id is not None
    assert semestre.codigo == "2026-1"
    assert "2026-1" in [s.codigo for s in repository.listar_semestres()]


def test_crear_semestre_con_codigo_duplicado_falla_por_unicidad():
    _semestre("2026-1")

    with pytest.raises(IntegrityError):
        repository.crear_semestre(
            "2026-1", datetime.date(2026, 7, 1), datetime.date(2026, 12, 1)
        )


def test_crear_semestre_con_fecha_inicio_no_anterior_a_fecha_fin_falla_por_check_constraint():
    # A diferencia de los FK (DEFERRABLE INITIALLY DEFERRED), un CHECK
    # constraint de Postgres no es deferrable: se evalúa en el INSERT.
    with pytest.raises(IntegrityError):
        repository.crear_semestre(
            "2026-1", datetime.date(2026, 6, 15), datetime.date(2026, 1, 15)
        )


def test_obtener_semestre_por_id_y_por_codigo():
    creado = _semestre("2026-1")

    assert repository.obtener_semestre_por_id(creado.id).codigo == "2026-1"
    assert repository.obtener_semestre_por_codigo("2026-1").id == creado.id


def test_obtener_semestre_por_id_inexistente_devuelve_none():
    assert repository.obtener_semestre_por_id("00000000-0000-0000-0000-000000000000") is None


# ------------------------------------------------------------------
# Programacion
# ------------------------------------------------------------------


def test_crear_programacion_lo_persiste_con_sus_fks():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()

    programacion = repository.crear_programacion(
        salon.id,
        docente.id,
        semestre.id,
        DiaSemana.LUNES,
        datetime.time(8, 0),
        datetime.time(10, 0),
        "Cálculo I",
    )

    assert programacion.id is not None
    assert programacion.salon_id == salon.id
    assert programacion.docente_id == docente.id
    assert programacion.semestre_id == semestre.id
    assert programacion.dia == DiaSemana.LUNES
    assert programacion.hora_inicio == datetime.time(8, 0)
    assert programacion.hora_fin == datetime.time(10, 0)
    assert programacion.materia == "Cálculo I"


def test_crear_programacion_con_dia_invalido_falla_por_check_constraint():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        repository.crear_programacion(
            salon.id,
            docente.id,
            semestre.id,
            "feriado",
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )


def test_crear_programacion_con_hora_inicio_no_anterior_a_hora_fin_falla_por_check_constraint():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        repository.crear_programacion(
            salon.id,
            docente.id,
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(10, 0),
            datetime.time(8, 0),
            "Cálculo I",
        )


def test_crear_programacion_con_salon_inexistente_falla_por_fk():
    # Postgres declara los FK de Django DEFERRABLE INITIALLY DEFERRED, así
    # que el INSERT en sí no falla — el chequeo real ocurre en
    # check_constraints() (Django lo llama recién al hacer rollback del
    # test). Se fuerza aquí para no depender del orden de teardown (ver
    # catalogos/tests/test_repository.py::test_crear_salon_con_bloque_inexistente_falla_por_fk).
    docente = _docente()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        repository.crear_programacion(
            "00000000-0000-0000-0000-000000000000",
            docente.id,
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )
        connection.check_constraints()


def test_crear_programacion_con_docente_inexistente_falla_por_fk():
    salon = _salon()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        repository.crear_programacion(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )
        connection.check_constraints()


def test_crear_programacion_con_semestre_inexistente_falla_por_fk():
    salon = _salon()
    docente = _docente()

    with pytest.raises(IntegrityError):
        repository.crear_programacion(
            salon.id,
            docente.id,
            "00000000-0000-0000-0000-000000000000",
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )
        connection.check_constraints()


def test_listar_programaciones():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    repository.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )
    repository.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.MARTES,
        datetime.time(8, 0), datetime.time(10, 0), "Álgebra",
    )

    materias = {p.materia for p in repository.listar_programaciones()}

    assert {"Cálculo I", "Álgebra"} <= materias


def test_listar_programaciones_por_salon_y_dia():
    salon_1 = _salon("101")
    salon_2 = _salon("102")
    docente = _docente()
    semestre = _semestre()
    repository.crear_programacion(
        salon_1.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )
    repository.crear_programacion(
        salon_1.id, docente.id, semestre.id, DiaSemana.MARTES,
        datetime.time(8, 0), datetime.time(10, 0), "Álgebra",
    )
    repository.crear_programacion(
        salon_2.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Física",
    )

    resultado = repository.listar_programaciones_por_salon_y_dia(salon_1.id, DiaSemana.LUNES)

    assert [p.materia for p in resultado] == ["Cálculo I"]
