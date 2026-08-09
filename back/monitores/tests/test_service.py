"""
Tests de monitores/service.py — la lógica que agrega valor sobre el
repository: validación de FKs cross-módulo (docente_titular_id/
monitor_delegado_id vía comunidad.service), la validación de negocio
"docente distinto de monitor" (domain.validar_docente_distinto_de_monitor)
y las dos consultas pensadas para el futuro `llaves`
(`listar_monitorias_del_monitor`, `clases_del_docente_titular`, esta
última cruzando con `programacion.service`). Los passthrough directos ya
están cubiertos transitivamente por test_repository.py.
"""

import datetime

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from monitores import repository, service
from monitores.model import DiaSemana
from programacion import service as programacion_service

pytestmark = pytest.mark.django_db


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _semestre(codigo="2026-1"):
    return programacion_service.crear_semestre(
        codigo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )


# ------------------------------------------------------------------
# crear_monitor — validación de referencias
# ------------------------------------------------------------------


def test_crear_monitor_con_docente_inexistente_da_value_error_claro():
    monitor_delegado = _persona("1000000002", "Monitor Delegado")

    with pytest.raises(ValueError, match="docente_titular"):
        service.crear_monitor(
            "00000000-0000-0000-0000-000000000000", monitor_delegado.id, "Cálculo I"
        )


def test_crear_monitor_con_monitor_delegado_inexistente_da_value_error_claro():
    docente = _persona("1000000001", "Docente Titular")

    with pytest.raises(ValueError, match="monitor_delegado"):
        service.crear_monitor(
            docente.id, "00000000-0000-0000-0000-000000000000", "Cálculo I"
        )


def test_crear_monitor_con_docente_igual_a_monitor_da_value_error_claro():
    persona = _persona("1000000001", "Docente y Monitor")

    with pytest.raises(ValueError, match="monitor delegado"):
        service.crear_monitor(persona.id, persona.id, "Cálculo I")


def test_crear_monitor_con_referencias_validas_delega_al_repository():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")

    monitor = service.crear_monitor(
        docente.id, monitor_delegado.id, "Cálculo I", dia=DiaSemana.LUNES
    )

    assert monitor.docente_titular_id == docente.id
    assert monitor.monitor_delegado_id == monitor_delegado.id
    assert monitor.dia == DiaSemana.LUNES


# ------------------------------------------------------------------
# obtener_monitor / listar_monitores
# ------------------------------------------------------------------


def test_obtener_monitor_inexistente_devuelve_none():
    assert service.obtener_monitor("00000000-0000-0000-0000-000000000000") is None


def test_obtener_monitor_existente_lo_devuelve():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    creado = service.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    assert service.obtener_monitor(creado.id).id == creado.id


def test_listar_monitores_delega_al_repository():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    service.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    materias = {m.materia for m in service.listar_monitores()}

    assert "Cálculo I" in materias


# ------------------------------------------------------------------
# listar_monitorias_del_monitor — solo activas
# ------------------------------------------------------------------


def test_listar_monitorias_del_monitor_devuelve_solo_activas():
    docente_1 = _persona("1000000001", "Docente Uno")
    docente_2 = _persona("1000000002", "Docente Dos")
    monitor_delegado = _persona("1000000003", "Monitor Delegado")
    activa = service.crear_monitor(docente_1.id, monitor_delegado.id, "Cálculo I")
    inactiva = service.crear_monitor(docente_2.id, monitor_delegado.id, "Álgebra")
    repository.desactivar_monitor(inactiva.id)

    resultado = service.listar_monitorias_del_monitor(monitor_delegado.id)

    assert [m.id for m in resultado] == [activa.id]


def test_listar_monitorias_del_monitor_sin_monitorias_devuelve_lista_vacia():
    monitor_delegado = _persona("1000000001", "Monitor Delegado")

    assert service.listar_monitorias_del_monitor(monitor_delegado.id) == []


# ------------------------------------------------------------------
# clases_del_docente_titular — cruce con programacion.service
# ------------------------------------------------------------------


def test_clases_del_docente_titular_de_monitor_inexistente_devuelve_none():
    assert (
        service.clases_del_docente_titular("00000000-0000-0000-0000-000000000000")
        is None
    )


def test_clases_del_docente_titular_devuelve_las_clases_del_docente():
    salon = _salon()
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    semestre = _semestre()
    programacion_service.crear_programacion(
        salon.id,
        docente.id,
        semestre.id,
        DiaSemana.LUNES,
        datetime.time(8, 0),
        datetime.time(10, 0),
        "Cálculo I",
    )
    monitoria = service.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    clases = service.clases_del_docente_titular(monitoria.id)

    assert [c.materia for c in clases] == ["Cálculo I"]


def test_clases_del_docente_titular_sin_clases_programadas_devuelve_lista_vacia():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    monitoria = service.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    assert service.clases_del_docente_titular(monitoria.id) == []


# ------------------------------------------------------------------
# desactivar_monitor
# ------------------------------------------------------------------


def test_desactivar_monitor_inexistente_devuelve_none():
    assert service.desactivar_monitor("00000000-0000-0000-0000-000000000000") is None


def test_desactivar_monitor_existente_lo_desactiva():
    docente = _persona("1000000001", "Docente Titular")
    monitor_delegado = _persona("1000000002", "Monitor Delegado")
    creado = service.crear_monitor(docente.id, monitor_delegado.id, "Cálculo I")

    desactivado = service.desactivar_monitor(creado.id)

    assert desactivado.activo is False
