"""
Tests de monitores/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

Los fixtures cross-módulo (docente titular, monitor delegado) se crean
vía la API pública de `comunidad.service`, nunca vía
`comunidad.repository`/`comunidad.model` — la regla dura de módulos
aplica también en tests (ver programacion/tests/test_repository.py).
"""

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from monitores import repository
from monitores.model import DiaSemana

pytestmark = pytest.mark.django_db


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


# ------------------------------------------------------------------
# crear_monitor
# ------------------------------------------------------------------


def test_crear_monitor_lo_persiste_con_sus_fks():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")

    monitor = repository.crear_monitor(
        docente.id,
        monitor_delegado.id,
        "Cálculo I",
        aula="101",
        dia=DiaSemana.LUNES,
        horario="8-10",
    )

    assert monitor.id is not None
    assert monitor.docente_titular_id == docente.id
    assert monitor.monitor_delegado_id == monitor_delegado.id
    assert monitor.materia == "Cálculo I"
    assert monitor.aula == "101"
    assert monitor.dia == DiaSemana.LUNES
    assert monitor.horario == "8-10"
    assert monitor.activo is True


def test_crear_monitor_sin_dia_ni_aula_ni_horario_lo_permite():
    # `dia` (y aula/horario) son NULLABLE: una monitoría puede no tener
    # día fijo (ver model.py, nota de diseño).
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")

    monitor = repository.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    assert monitor.dia is None
    assert monitor.aula is None
    assert monitor.horario is None


def test_crear_monitor_con_dia_invalido_falla_por_check_constraint():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")

    with pytest.raises(IntegrityError):
        repository.crear_monitor(
            docente.id, monitor_delegado.id, "Cálculo I", dia="feriado"
        )


def test_crear_monitor_con_docente_igual_a_monitor_falla_por_check_constraint():
    # CHECK (docente_titular_id != monitor_delegado_id) del DDL: a
    # diferencia de los FK (DEFERRABLE INITIALLY DEFERRED), este CHECK no
    # es deferrable — se dispara inmediato en el INSERT, así que este
    # caso lo atrapa un pytest.raises(IntegrityError) normal sin
    # necesitar connection.check_constraints().
    persona = _persona("1000000001", "Docente y Monitor")

    with pytest.raises(IntegrityError):
        repository.crear_monitor(persona.id, persona.id, "Cálculo I")


def test_crear_monitor_con_docente_inexistente_falla_por_fk():
    monitor_delegado = _persona("1000000002", "Monitor Delegado")

    with pytest.raises(IntegrityError):
        repository.crear_monitor(
            "00000000-0000-0000-0000-000000000000", monitor_delegado.id, "Cálculo I"
        )
        connection.check_constraints()


def test_crear_monitor_con_monitor_delegado_inexistente_falla_por_fk():
    docente = _persona("1000000001", "Docente Titular")

    with pytest.raises(IntegrityError):
        repository.crear_monitor(
            docente.id, "00000000-0000-0000-0000-000000000000", "Cálculo I"
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# obtener_por_id / listar_monitores
# ------------------------------------------------------------------


def test_obtener_por_id_inexistente_devuelve_none():
    assert repository.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_id_existente_lo_devuelve():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    creado = repository.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    assert repository.obtener_por_id(creado.id).id == creado.id


def test_listar_monitores():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    repository.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")
    repository.crear_monitor(docente.id, monitor_delegado.id, "Álgebra")

    materias = {m.materia for m in repository.listar_monitores()}

    assert {"Cálculo I", "Álgebra"} <= materias


# ------------------------------------------------------------------
# listar_por_monitor_delegado
# ------------------------------------------------------------------


def test_listar_por_monitor_delegado():
    docente_1 = _persona("1000000001", "Docente Uno")
    docente_2 = _persona("1000000002", "Docente Dos")
    monitor_delegado = _persona("1000000003", "Monitor Delegado")
    otro_monitor = _persona("1000000004", "Otro Monitor")
    repository.crear_monitor(docente_1.id, monitor_delegado.id, "Cálculo I")
    repository.crear_monitor(docente_2.id, monitor_delegado.id, "Álgebra")
    repository.crear_monitor(docente_1.id, otro_monitor.id, "Física")

    resultado = repository.listar_por_monitor_delegado(monitor_delegado.id)

    assert {m.materia for m in resultado} == {"Cálculo I", "Álgebra"}


def test_listar_por_monitor_delegado_sin_monitorias_devuelve_lista_vacia():
    monitor_delegado = _persona("1000000001", "Monitor Delegado")

    assert repository.listar_por_monitor_delegado(monitor_delegado.id) == []


# ------------------------------------------------------------------
# desactivar_monitor
# ------------------------------------------------------------------


def test_desactivar_monitor_pone_activo_false():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    creado = repository.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    desactivado = repository.desactivar_monitor(creado.id)

    assert desactivado.activo is False
    assert repository.obtener_por_id(creado.id).activo is False


def test_desactivar_monitor_inexistente_devuelve_none():
    assert repository.desactivar_monitor("00000000-0000-0000-0000-000000000000") is None
