"""
Tests de reservas/service.py — la lógica que agrega valor sobre el
repository: validación de FKs cross-módulo (salon_id vía
catalogos.service, solicitante_id vía comunidad.service), la validación de
solapamiento de horarios contra reservas 'aprobada' (ver docstring de
service.py y domain.hay_solapamiento), y las transiciones de estado
(cancelar_reserva/completar_reserva). Los passthrough directos ya están
cubiertos transitivamente por test_repository.py.
"""

import datetime

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from reservas import repository, service
from reservas.model import EstadoReservaIndividual

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _solicitante(numero_documento="1000000001", nombre="Solicitante Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


# ------------------------------------------------------------------
# crear_reserva — validación de referencias
# ------------------------------------------------------------------


def test_crear_reserva_con_salon_inexistente_da_value_error_claro():
    solicitante = _solicitante()

    with pytest.raises(ValueError, match="salon"):
        service.crear_reserva(
            "00000000-0000-0000-0000-000000000000",
            solicitante.id,
            datetime.date(2026, 3, 10),
            datetime.time(8, 0),
            datetime.time(10, 0),
        )


def test_crear_reserva_con_solicitante_inexistente_da_value_error_claro():
    salon = _salon()

    with pytest.raises(ValueError, match="solicitante"):
        service.crear_reserva(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            datetime.date(2026, 3, 10),
            datetime.time(8, 0),
            datetime.time(10, 0),
        )


def test_crear_reserva_con_referencias_validas_delega_al_repository():
    salon = _salon()
    solicitante = _solicitante()

    reserva = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0), motivo="Reunión de grupo",
    )

    assert reserva.salon_id == salon.id
    assert reserva.solicitante_id == solicitante.id
    assert reserva.motivo == "Reunión de grupo"


def test_crear_reserva_nace_siempre_aprobada():
    salon = _salon()
    solicitante = _solicitante()

    reserva = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert reserva.estado == EstadoReservaIndividual.APROBADA


# ------------------------------------------------------------------
# crear_reserva — validación de solapamiento
# ------------------------------------------------------------------


def test_crear_reserva_con_solapamiento_en_mismo_salon_y_fecha_da_value_error_claro():
    salon = _salon()
    solicitante = _solicitante()
    fecha = datetime.date(2026, 3, 10)
    service.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(8, 0), datetime.time(10, 0)
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_reserva(
            salon.id, solicitante.id, fecha, datetime.time(9, 0), datetime.time(11, 0)
        )


def test_crear_reserva_con_horas_adyacentes_no_da_value_error():
    salon = _salon()
    solicitante = _solicitante()
    fecha = datetime.date(2026, 3, 10)
    service.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(8, 0), datetime.time(10, 0)
    )

    # No debe lanzar: 10:00 es el fin de la primera y el inicio de la
    # segunda, franjas adyacentes que no se solapan (ver domain.py).
    segunda = service.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(10, 0), datetime.time(12, 0)
    )

    assert segunda.hora_inicio == datetime.time(10, 0)


def test_crear_reserva_mismo_salon_distinta_fecha_no_da_value_error():
    salon = _salon()
    solicitante = _solicitante()
    service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    otra_fecha = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 11),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert otra_fecha.fecha == datetime.date(2026, 3, 11)


def test_crear_reserva_mismas_horas_en_otro_salon_no_da_value_error():
    salon_1 = _salon("101")
    salon_2 = _salon("102")
    solicitante = _solicitante()
    fecha = datetime.date(2026, 3, 10)
    service.crear_reserva(
        salon_1.id, solicitante.id, fecha, datetime.time(8, 0), datetime.time(10, 0)
    )

    en_otro_salon = service.crear_reserva(
        salon_2.id, solicitante.id, fecha, datetime.time(8, 0), datetime.time(10, 0)
    )

    assert en_otro_salon.salon_id == salon_2.id


def test_crear_reserva_no_choca_con_una_reserva_previa_cancelada():
    salon = _salon()
    solicitante = _solicitante()
    fecha = datetime.date(2026, 3, 10)
    primera = service.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(8, 0), datetime.time(10, 0)
    )
    service.cancelar_reserva(primera.id)

    # No debe lanzar: la primera ya está cancelada, no bloquea el horario.
    segunda = service.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(9, 0), datetime.time(11, 0)
    )

    assert segunda.hora_inicio == datetime.time(9, 0)


# ------------------------------------------------------------------
# existe_solapamiento_en_salon — pieza reutilizable
# ------------------------------------------------------------------


def test_existe_solapamiento_en_salon_true_cuando_choca():
    salon = _salon()
    solicitante = _solicitante()
    fecha = datetime.date(2026, 3, 10)
    service.crear_reserva(
        salon.id, solicitante.id, fecha, datetime.time(8, 0), datetime.time(10, 0)
    )

    assert service.existe_solapamiento_en_salon(
        salon.id, fecha, datetime.time(9, 0), datetime.time(11, 0)
    ) is True


def test_existe_solapamiento_en_salon_false_cuando_no_hay_nada_reservado():
    salon = _salon()
    fecha = datetime.date(2026, 3, 10)

    assert service.existe_solapamiento_en_salon(
        salon.id, fecha, datetime.time(9, 0), datetime.time(11, 0)
    ) is False


# ------------------------------------------------------------------
# obtener_reserva / listar_reservas / listar_reservas_por_solicitante
# ------------------------------------------------------------------


def test_obtener_reserva_inexistente_devuelve_none():
    assert service.obtener_reserva("00000000-0000-0000-0000-000000000000") is None


def test_obtener_reserva_existente_la_devuelve():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert service.obtener_reserva(creada.id).id == creada.id


def test_listar_reservas_por_solicitante_delega_al_repository():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    resultado = service.listar_reservas_por_solicitante(solicitante.id)

    assert [r.id for r in resultado] == [creada.id]


# ------------------------------------------------------------------
# cancelar_reserva
# ------------------------------------------------------------------


def test_cancelar_reserva_transiciona_de_aprobada_a_cancelada():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    cancelada = service.cancelar_reserva(creada.id)

    assert cancelada.estado == EstadoReservaIndividual.CANCELADA


def test_cancelar_reserva_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="No existe"):
        service.cancelar_reserva("00000000-0000-0000-0000-000000000000")


def test_cancelar_reserva_ya_cancelada_da_value_error_claro():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.cancelar_reserva(creada.id)

    with pytest.raises(ValueError, match="aprobada"):
        service.cancelar_reserva(creada.id)


# ------------------------------------------------------------------
# completar_reserva
# ------------------------------------------------------------------


def test_completar_reserva_transiciona_de_aprobada_a_completada():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    completada = service.completar_reserva(creada.id)

    assert completada.estado == EstadoReservaIndividual.COMPLETADA
    assert repository.obtener_por_id(creada.id).estado == EstadoReservaIndividual.COMPLETADA


def test_completar_reserva_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="No existe"):
        service.completar_reserva("00000000-0000-0000-0000-000000000000")


def test_completar_reserva_cancelada_da_value_error_claro():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.cancelar_reserva(creada.id)

    with pytest.raises(ValueError, match="aprobada"):
        service.completar_reserva(creada.id)


def test_completar_reserva_ya_completada_da_value_error_claro():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.completar_reserva(creada.id)

    with pytest.raises(ValueError, match="aprobada"):
        service.completar_reserva(creada.id)
