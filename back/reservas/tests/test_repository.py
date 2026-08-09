"""
Tests de reservas/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

Los fixtures cross-módulo (salon, solicitante) se crean vía la API pública
de cada módulo (`catalogos.service`, `comunidad.service`), nunca vía sus
`repository`/`model` — la regla dura de módulos aplica también en tests
(ver programacion/tests/test_repository.py).
"""

import datetime

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from reservas import repository
from reservas.model import EstadoReservaIndividual, ReservaIndividual

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _reserva(
    salon=None,
    solicitante=None,
    fecha=None,
    hora_inicio=None,
    hora_fin=None,
):
    salon = salon or _salon()
    solicitante = solicitante or _persona()
    fecha = fecha or datetime.date(2026, 3, 10)
    hora_inicio = hora_inicio or datetime.time(8, 0)
    hora_fin = hora_fin or datetime.time(10, 0)
    return repository.crear_reserva(salon.id, solicitante.id, fecha, hora_inicio, hora_fin)


# ------------------------------------------------------------------
# crear_reserva
# ------------------------------------------------------------------


def test_crear_reserva_la_persiste_con_sus_valores_y_defaults():
    salon = _salon()
    solicitante = _persona()

    reserva = repository.crear_reserva(
        salon.id,
        solicitante.id,
        datetime.date(2026, 3, 10),
        datetime.time(8, 0),
        datetime.time(10, 0),
        motivo="Asesoría de tesis",
    )

    assert reserva.id is not None
    assert reserva.salon_id == salon.id
    assert reserva.solicitante_id == solicitante.id
    assert reserva.fecha == datetime.date(2026, 3, 10)
    assert reserva.hora_inicio == datetime.time(8, 0)
    assert reserva.hora_fin == datetime.time(10, 0)
    assert reserva.motivo == "Asesoría de tesis"
    # Valor por defecto del DDL (ver model.py).
    assert reserva.estado == EstadoReservaIndividual.APROBADA


def test_crear_reserva_sin_motivo_lo_permite():
    salon = _salon()
    solicitante = _persona()

    reserva = repository.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert reserva.motivo is None


def test_crear_reserva_con_hora_inicio_no_anterior_a_hora_fin_falla_por_check_constraint():
    salon = _salon()
    solicitante = _persona()

    with pytest.raises(IntegrityError):
        repository.crear_reserva(
            salon.id, solicitante.id, datetime.date(2026, 3, 10),
            datetime.time(10, 0), datetime.time(8, 0),
        )


def test_crear_reserva_con_estado_invalido_falla_por_check_constraint():
    # repository.crear_reserva no acepta `estado` como parámetro (nace
    # siempre 'aprobada', ver docstring del módulo) — se fuerza el CHECK
    # instanciando el modelo directamente, mismo recurso que
    # llaves/tests/test_repository.py usa para origen/tipo_entrega
    # inválidos.
    salon = _salon()
    solicitante = _persona()

    with pytest.raises(IntegrityError):
        ReservaIndividual.objects.create(
            salon_id=salon.id,
            solicitante_id=solicitante.id,
            fecha=datetime.date(2026, 3, 10),
            hora_inicio=datetime.time(8, 0),
            hora_fin=datetime.time(10, 0),
            estado="invalido",
        )


def test_crear_reserva_con_salon_inexistente_falla_por_fk():
    solicitante = _persona()

    with pytest.raises(IntegrityError):
        repository.crear_reserva(
            "00000000-0000-0000-0000-000000000000",
            solicitante.id,
            datetime.date(2026, 3, 10),
            datetime.time(8, 0),
            datetime.time(10, 0),
        )
        connection.check_constraints()


def test_crear_reserva_con_solicitante_inexistente_falla_por_fk():
    salon = _salon()

    with pytest.raises(IntegrityError):
        repository.crear_reserva(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            datetime.date(2026, 3, 10),
            datetime.time(8, 0),
            datetime.time(10, 0),
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# obtener_por_id / listar_reservas
# ------------------------------------------------------------------


def test_obtener_por_id_inexistente_devuelve_none():
    assert repository.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_id_existente_lo_devuelve():
    creada = _reserva()

    assert repository.obtener_por_id(creada.id).id == creada.id


def test_listar_reservas():
    solicitante = _persona()
    _reserva(salon=_salon("101"), solicitante=solicitante, fecha=datetime.date(2026, 3, 10))
    _reserva(salon=_salon("102"), solicitante=solicitante, fecha=datetime.date(2026, 3, 11))

    assert len(repository.listar_reservas()) >= 2


# ------------------------------------------------------------------
# listar_por_salon_y_fecha_aprobadas
# ------------------------------------------------------------------


def test_listar_por_salon_y_fecha_aprobadas_solo_devuelve_ese_salon_fecha_y_estado():
    salon = _salon()
    solicitante = _persona()
    fecha = datetime.date(2026, 3, 10)
    aprobada = repository.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(8, 0), datetime.time(10, 0)
    )
    cancelada = repository.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(11, 0), datetime.time(12, 0)
    )
    repository.cambiar_estado(cancelada.id, EstadoReservaIndividual.CANCELADA)
    # Otra fecha, no debe aparecer.
    repository.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 11),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    # Otro salón, no debe aparecer.
    repository.crear_reserva(
        _salon("102").id, solicitante.id, fecha,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    resultado = repository.listar_por_salon_y_fecha_aprobadas(salon.id, fecha)

    assert {r.id for r in resultado} == {aprobada.id}


# ------------------------------------------------------------------
# listar_por_solicitante
# ------------------------------------------------------------------


def test_listar_por_solicitante_solo_devuelve_las_de_ese_solicitante():
    solicitante_1 = _persona("1000000001", "Solicitante Uno")
    solicitante_2 = _persona("1000000002", "Solicitante Dos")
    de_solicitante_1 = _reserva(salon=_salon("101"), solicitante=solicitante_1)
    de_solicitante_2 = _reserva(salon=_salon("102"), solicitante=solicitante_2)

    resultado = repository.listar_por_solicitante(solicitante_1.id)

    assert {r.id for r in resultado} == {de_solicitante_1.id}
    assert de_solicitante_2.id not in {r.id for r in resultado}


# ------------------------------------------------------------------
# cambiar_estado
# ------------------------------------------------------------------


def test_cambiar_estado_actualiza_y_persiste():
    creada = _reserva()

    actualizada = repository.cambiar_estado(
        creada.id, EstadoReservaIndividual.CANCELADA
    )

    assert actualizada.estado == EstadoReservaIndividual.CANCELADA
    assert repository.obtener_por_id(creada.id).estado == EstadoReservaIndividual.CANCELADA


def test_cambiar_estado_inexistente_devuelve_none():
    assert (
        repository.cambiar_estado(
            "00000000-0000-0000-0000-000000000000", EstadoReservaIndividual.CANCELADA
        )
        is None
    )
