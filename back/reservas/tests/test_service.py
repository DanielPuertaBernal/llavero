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
from programacion import service as programacion_service
from reservas import repository, service
from reservas.model import EstadoReservaIndividual
from reservas_semestrales import service as reservas_semestrales_service
from reservas_semestrales.model import DiaSemana as DiaSemanaSemestral

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _solicitante(numero_documento="1000000001", nombre="Solicitante Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _docente(numero_documento="1000000098"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, "Docente Prueba", tipo_persona.id)


def _semestre(codigo="2026-1"):
    return programacion_service.crear_semestre(
        codigo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )


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
# crear_reserva — validación de la franja horaria
# ------------------------------------------------------------------
#
# `hora_inicio < hora_fin` también lo garantiza el CHECK
# `ck_reserva_individual_horario_valido` del DDL (ver
# `test_repository.test_crear_reserva_con_hora_inicio_no_anterior_a_hora_
# fin_falla_por_check_constraint`), pero ahí llega como IntegrityError
# crudo — un 500 sin `detail` para el cliente. El service la valida antes
# para que el controller la traduzca a un 400 como el resto de las reglas
# (mismo criterio que `reservas_semestrales.service`).


def test_crear_reserva_con_hora_inicio_posterior_a_hora_fin_da_value_error_claro():
    salon = _salon()
    solicitante = _solicitante()

    with pytest.raises(ValueError, match="anterior"):
        service.crear_reserva(
            salon.id, solicitante.id, datetime.date(2026, 3, 10),
            datetime.time(10, 0), datetime.time(8, 0),
        )


def test_crear_reserva_con_hora_inicio_igual_a_hora_fin_da_value_error_claro():
    salon = _salon()
    solicitante = _solicitante()

    # Franja vacía: el CHECK del DDL exige `<` estricto, no `<=`.
    with pytest.raises(ValueError, match="anterior"):
        service.crear_reserva(
            salon.id, solicitante.id, datetime.date(2026, 3, 10),
            datetime.time(8, 0), datetime.time(8, 0),
        )


def test_crear_reserva_con_franja_minima_valida_no_da_value_error():
    salon = _salon()
    solicitante = _solicitante()

    # Un minuto de duración es el caso válido más pequeño, justo al lado
    # del límite: fija el criterio en `>=` y no en algo más permisivo.
    reserva = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(8, 1),
    )

    assert reserva.hora_fin == datetime.time(8, 1)


def test_crear_reserva_con_franja_invalida_no_consulta_las_referencias():
    # La franja es pura y no toca la DB: se valida ANTES que salon_id/
    # solicitante_id, así que un request con AMBOS problemas reporta la
    # franja (ver docstring de `service.crear_reserva`).
    with pytest.raises(ValueError, match="anterior"):
        service.crear_reserva(
            "00000000-0000-0000-0000-000000000000",
            "00000000-0000-0000-0000-000000000000",
            datetime.date(2026, 3, 10),
            datetime.time(10, 0), datetime.time(8, 0),
        )


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
# crear_reserva — validación cruzada RF15: contra Programacion y
# ReservaSemestral (fuentes recurrentes, ver docstring de
# service.crear_reserva y reservas.domain.dia_semana_de_fecha).
# ------------------------------------------------------------------


def test_crear_reserva_con_solapamiento_contra_programacion_da_value_error():
    salon = _salon()
    solicitante = _solicitante()
    docente = _docente()
    semestre = _semestre()
    programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, "lunes",
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    # Lunes 9 de marzo de 2026.
    with pytest.raises(ValueError, match="solapa"):
        service.crear_reserva(
            salon.id, solicitante.id, datetime.date(2026, 3, 9),
            datetime.time(9, 0), datetime.time(11, 0),
        )


def test_crear_reserva_con_solapamiento_contra_reserva_semestral_da_value_error():
    salon = _salon()
    solicitante = _solicitante()
    otro_solicitante = _solicitante("1000000097", "Otro Solicitante")
    semestre = _semestre()
    reservas_semestrales_service.crear_reserva_semestral(
        salon.id, otro_solicitante.id, semestre.id, DiaSemanaSemestral.LUNES,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_reserva(
            salon.id, solicitante.id, datetime.date(2026, 3, 9),
            datetime.time(9, 0), datetime.time(11, 0),
        )


def test_crear_reserva_sin_choque_contra_programacion_ni_reserva_semestral_no_da_value_error():
    salon = _salon()
    solicitante = _solicitante()
    docente = _docente()
    semestre = _semestre()
    programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, "lunes",
        datetime.time(10, 0), datetime.time(12, 0), "Cálculo I",
    )

    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert creada.fecha == datetime.date(2026, 3, 9)


def test_crear_reserva_no_choca_con_programacion_de_otro_dia_de_semana():
    salon = _salon()
    solicitante = _solicitante()
    docente = _docente()
    semestre = _semestre()
    programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, "martes",
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    # 2026-03-09 es lunes, no martes: no debe chocar con la programación.
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert creada.fecha == datetime.date(2026, 3, 9)


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


def test_listar_reservas_por_estado_solo_devuelve_ese_estado():
    salon = _salon()
    solicitante = _solicitante()
    aprobada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    otro_salon = _salon("102")
    cancelada = service.crear_reserva(
        otro_salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.cancelar_reserva(cancelada.id)

    resultado = service.listar_reservas_por_estado(EstadoReservaIndividual.APROBADA)

    assert aprobada.id in {r.id for r in resultado}
    assert cancelada.id not in {r.id for r in resultado}


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


# ------------------------------------------------------------------
# marcar_no_reclamada
# ------------------------------------------------------------------


def test_marcar_no_reclamada_transiciona_de_aprobada_a_no_reclamada():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    assert creada.estado == EstadoReservaIndividual.APROBADA

    resultado = service.marcar_no_reclamada(creada.id)

    assert resultado.estado == EstadoReservaIndividual.NO_RECLAMADA
    assert repository.obtener_por_id(creada.id).estado == EstadoReservaIndividual.NO_RECLAMADA


def test_marcar_no_reclamada_ya_no_reclamada_es_no_op():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.marcar_no_reclamada(creada.id)

    resultado = service.marcar_no_reclamada(creada.id)

    assert resultado.estado == EstadoReservaIndividual.NO_RECLAMADA


def test_marcar_no_reclamada_completada_es_no_op():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.completar_reserva(creada.id)

    resultado = service.marcar_no_reclamada(creada.id)

    assert resultado.estado == EstadoReservaIndividual.COMPLETADA


def test_marcar_no_reclamada_cancelada_es_no_op():
    salon = _salon()
    solicitante = _solicitante()
    creada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.cancelar_reserva(creada.id)

    resultado = service.marcar_no_reclamada(creada.id)

    assert resultado.estado == EstadoReservaIndividual.CANCELADA


def test_marcar_no_reclamada_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="No existe"):
        service.marcar_no_reclamada("00000000-0000-0000-0000-000000000000")


# ------------------------------------------------------------------
# listar_reservas_aprobadas_hasta
# ------------------------------------------------------------------


def test_listar_reservas_aprobadas_hasta_delega_al_repository():
    salon = _salon()
    solicitante = _solicitante()
    aprobada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    despues = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 12),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    resultado = service.listar_reservas_aprobadas_hasta(datetime.date(2026, 3, 10))

    ids = {r.id for r in resultado}
    assert ids == {aprobada.id}
    assert despues.id not in ids


# ------------------------------------------------------------------
# listar_por_salon — agregado para el consumo del futuro `disponibilidad`
# (RF14): a diferencia de `listar_reservas_aprobadas_hasta`, esta NO filtra
# por estado (una vista de calendario también necesita mostrar reservas
# canceladas/completadas si el caller lo pide) ni por una fecha puntual —
# admite un rango opcional [fecha_desde, fecha_hasta].
# ------------------------------------------------------------------


def test_listar_por_salon_sin_rango_devuelve_todas_las_reservas_del_salon_sin_filtrar_por_estado():
    salon = _salon()
    otro_salon = _salon("102")
    solicitante = _solicitante()
    aprobada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    otra_fecha = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 12),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    cancelada = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 14),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.cancelar_reserva(cancelada.id)
    service.crear_reserva(
        otro_salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    resultado = service.listar_por_salon(salon.id)

    ids = {r.id for r in resultado}
    assert ids == {aprobada.id, otra_fecha.id, cancelada.id}


def test_listar_por_salon_con_rango_de_fechas_filtra_inclusive_en_ambos_extremos():
    salon = _salon()
    solicitante = _solicitante()
    antes = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    dentro_inicio = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 10),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    dentro_fin = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 12),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    despues = service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 13),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    resultado = service.listar_por_salon(
        salon.id, fecha_desde=datetime.date(2026, 3, 10), fecha_hasta=datetime.date(2026, 3, 12)
    )

    ids = {r.id for r in resultado}
    assert ids == {dentro_inicio.id, dentro_fin.id}
    assert antes.id not in ids
    assert despues.id not in ids


def test_listar_por_salon_con_salon_sin_reservas_devuelve_lista_vacia():
    salon = _salon()

    resultado = service.listar_por_salon(salon.id)

    assert resultado == []
