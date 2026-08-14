"""
Tests de disponibilidad/service.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención TDD
del proyecto (ver `nfc/tests/test_service.py`, el otro módulo sin tabla
propia).

Todos los fixtures cross-módulo (salon, personas de comunidad, semestre,
programación, reserva semestral, reserva individual) se crean vía la API
pública de cada módulo (`catalogos.service`, `comunidad.service`,
`programacion.service`, `reservas_semestrales.service`, `reservas.service`),
nunca vía sus `repository`/`model` — la regla dura de módulos aplica
también en tests.
"""

import datetime

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from disponibilidad import service
from programacion import service as programacion_service
from programacion.model import DiaSemana
from reservas import service as reservas_service
from reservas_semestrales import service as reservas_semestrales_service

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _semestre(codigo="2026-1"):
    return programacion_service.crear_semestre(
        codigo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )


def _programacion(salon, docente, semestre, dia=DiaSemana.LUNES,
                   hora_inicio=datetime.time(8, 0), hora_fin=datetime.time(10, 0),
                   materia="Cálculo I"):
    return programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, dia, hora_inicio, hora_fin, materia,
    )


def _reserva_semestral(salon, solicitante, semestre, dia=DiaSemana.LUNES,
                        hora_inicio=datetime.time(10, 0), hora_fin=datetime.time(12, 0)):
    return reservas_semestrales_service.crear_reserva_semestral(
        salon.id, solicitante.id, semestre.id, dia, hora_inicio, hora_fin,
    )


def _reserva_individual(salon, solicitante, fecha,
                         hora_inicio=datetime.time(14, 0), hora_fin=datetime.time(16, 0)):
    return reservas_service.crear_reserva(
        salon.id, solicitante.id, fecha, hora_inicio, hora_fin,
    )


# 2026-03-09 es lunes (mismo ancla que nfc/tests/test_domain.py).
LUNES = datetime.date(2026, 3, 9)


# ------------------------------------------------------------------
# consultar_disponibilidad_salon — validación de referencias
# ------------------------------------------------------------------


def test_consultar_disponibilidad_con_salon_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="salon"):
        service.consultar_disponibilidad_salon("00000000-0000-0000-0000-000000000000")


def test_consultar_disponibilidad_con_dia_inconsistente_con_fecha_da_value_error():
    salon = _salon()

    with pytest.raises(ValueError, match="dia"):
        service.consultar_disponibilidad_salon(salon.id, dia="martes", fecha=LUNES)


# ------------------------------------------------------------------
# consultar_disponibilidad_salon — sin franjas
# ------------------------------------------------------------------


def test_consultar_disponibilidad_de_salon_sin_ninguna_franja_da_ocupaciones_vacias():
    salon = _salon()

    resultado = service.consultar_disponibilidad_salon(salon.id)

    assert resultado["salon_id"] == str(salon.id)
    assert resultado["ocupaciones"] == []
    assert resultado["conflictos"] == []


# ------------------------------------------------------------------
# consultar_disponibilidad_salon — superposición de las 3 fuentes (RF14)
# ------------------------------------------------------------------


def test_consultar_disponibilidad_por_dia_combina_programacion_y_reserva_semestral():
    salon = _salon()
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    solicitante = _persona("1000000002", "Solicitante")
    programacion = _programacion(salon, docente, semestre)
    reserva_sem = _reserva_semestral(salon, solicitante, semestre)

    resultado = service.consultar_disponibilidad_salon(salon.id, dia=DiaSemana.LUNES)

    assert resultado["dia"] == DiaSemana.LUNES
    origenes = {o["origen"] for o in resultado["ocupaciones"]}
    assert origenes == {"programacion", "reserva_semestral"}
    ids = {o["id"] for o in resultado["ocupaciones"]}
    assert ids == {str(programacion.id), str(reserva_sem.id)}
    # Sin fecha puntual no se calculan conflictos cruzados (ver docstring
    # de service.py: dia solo, sin fecha, no ancla las reservas
    # individuales a un día concreto).
    assert resultado["conflictos"] == []


def test_consultar_disponibilidad_por_fecha_agrega_tambien_reservas_individuales():
    salon = _salon()
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    solicitante_sem = _persona("1000000002", "Solicitante Semestral")
    solicitante_ind = _persona("1000000003", "Solicitante Individual")
    programacion = _programacion(salon, docente, semestre)
    reserva_sem = _reserva_semestral(salon, solicitante_sem, semestre)
    reserva_ind = _reserva_individual(salon, solicitante_ind, LUNES)

    resultado = service.consultar_disponibilidad_salon(salon.id, fecha=LUNES)

    assert resultado["dia"] == "lunes"
    assert resultado["fecha"] == LUNES.isoformat()
    origenes = {o["origen"] for o in resultado["ocupaciones"]}
    assert origenes == {"programacion", "reserva_semestral", "reserva_individual"}
    ids = {o["id"] for o in resultado["ocupaciones"]}
    assert ids == {str(programacion.id), str(reserva_sem.id), str(reserva_ind.id)}


def test_consultar_disponibilidad_no_incluye_franjas_de_otro_salon():
    salon = _salon("101")
    otro_salon = _salon("102")
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    _programacion(otro_salon, docente, semestre)

    resultado = service.consultar_disponibilidad_salon(salon.id, dia=DiaSemana.LUNES)

    assert resultado["ocupaciones"] == []


def test_consultar_disponibilidad_no_incluye_franjas_de_otro_dia():
    salon = _salon()
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    _programacion(salon, docente, semestre, dia=DiaSemana.MARTES)

    resultado = service.consultar_disponibilidad_salon(salon.id, dia=DiaSemana.LUNES)

    assert resultado["ocupaciones"] == []


def test_consultar_disponibilidad_sin_dia_ni_fecha_trae_todos_los_dias_recurrentes():
    salon = _salon()
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    lunes = _programacion(salon, docente, semestre, dia=DiaSemana.LUNES)
    martes = _programacion(
        salon, docente, semestre, dia=DiaSemana.MARTES, materia="Física I"
    )

    resultado = service.consultar_disponibilidad_salon(salon.id)

    ids = {o["id"] for o in resultado["ocupaciones"]}
    assert ids == {str(lunes.id), str(martes.id)}
    assert resultado["dia"] is None


# ------------------------------------------------------------------
# consultar_disponibilidad_salon — conflictos cruzados (marcado informativo,
# NO es la validación de escritura de RF15 — ver docstring del módulo)
# ------------------------------------------------------------------


def test_consultar_disponibilidad_marca_conflicto_entre_reserva_individual_y_programacion():
    salon = _salon()
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    solicitante = _persona("1000000002", "Solicitante")
    programacion = _programacion(
        salon, docente, semestre, hora_inicio=datetime.time(8, 0), hora_fin=datetime.time(10, 0)
    )
    # Reserva individual que se solapa con la clase (ver docstring del
    # módulo — no hay validación de escritura cruzada todavía, así que
    # esto puede existir en la base de datos hoy).
    reserva_ind = _reserva_individual(
        salon, solicitante, LUNES, hora_inicio=datetime.time(9, 0), hora_fin=datetime.time(11, 0)
    )

    resultado = service.consultar_disponibilidad_salon(salon.id, fecha=LUNES)

    pares = {
        frozenset((c["ocupacion_a_id"], c["ocupacion_b_id"]))
        for c in resultado["conflictos"]
    }
    assert frozenset((str(programacion.id), str(reserva_ind.id))) in pares


def test_consultar_disponibilidad_no_compara_ocupaciones_del_mismo_origen_entre_si():
    # `domain.hay_solapamiento` compara CUALQUIER par de franjas, pero
    # `service.py` debe filtrar los pares de un mismo `origen` antes de
    # llamarla: cada fuente ya se valida contra sí misma al escribir
    # (programacion/reservas_semestrales/reservas), así que dos franjas del
    # mismo origen jamás deberían aparecer en `conflictos` aunque, por
    # cualquier razón, terminaran solapadas en la base de datos.
    salon = _salon()
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    _programacion(
        salon, docente, semestre, hora_inicio=datetime.time(8, 0), hora_fin=datetime.time(10, 0)
    )

    resultado = service.consultar_disponibilidad_salon(salon.id, fecha=LUNES)

    assert resultado["conflictos"] == []


def test_consultar_disponibilidad_no_marca_conflicto_entre_franjas_sin_solapar():
    salon = _salon()
    semestre = _semestre()
    docente = _persona("1000000001", "Docente")
    solicitante = _persona("1000000002", "Solicitante")
    _programacion(
        salon, docente, semestre, hora_inicio=datetime.time(8, 0), hora_fin=datetime.time(10, 0)
    )
    _reserva_individual(
        salon, solicitante, LUNES, hora_inicio=datetime.time(10, 0), hora_fin=datetime.time(12, 0)
    )

    resultado = service.consultar_disponibilidad_salon(salon.id, fecha=LUNES)

    assert resultado["conflictos"] == []
