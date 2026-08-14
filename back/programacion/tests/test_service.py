"""
Tests de programacion/service.py — la lógica que agrega valor sobre el
repository: validación de FKs cross-módulo (salon_id vía
catalogos.service, docente_id vía comunidad.service, semestre_id contra
este mismo módulo) y, sobre todo, la validación de solapamiento de
horarios (ver docstring de service.py y domain.hay_solapamiento) — la
pieza central que este módulo aporta para resolver la deuda técnica de
lógica de solapamiento triplicada del sistema legacy. Los passthrough
directos ya están cubiertos transitivamente por test_repository.py.
"""

import datetime

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import repository, service
from programacion.model import DiaSemana
from reservas import service as reservas_service

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


def test_crear_semestre_delega_al_repository():
    semestre = service.crear_semestre(
        "2026-1", datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert semestre.codigo == "2026-1"


def test_obtener_semestre_inexistente_devuelve_none():
    assert service.obtener_semestre("00000000-0000-0000-0000-000000000000") is None


def test_obtener_semestre_existente_lo_devuelve():
    creado = _semestre()

    assert service.obtener_semestre(creado.id).id == creado.id


# ------------------------------------------------------------------
# crear_programacion — validación de referencias
# ------------------------------------------------------------------


def test_crear_programacion_con_salon_inexistente_da_value_error_claro():
    docente = _docente()
    semestre = _semestre()

    with pytest.raises(ValueError, match="salon"):
        service.crear_programacion(
            "00000000-0000-0000-0000-000000000000",
            docente.id,
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )


def test_crear_programacion_con_docente_inexistente_da_value_error_claro():
    salon = _salon()
    semestre = _semestre()

    with pytest.raises(ValueError, match="docente"):
        service.crear_programacion(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )


def test_crear_programacion_con_semestre_inexistente_da_value_error_claro():
    salon = _salon()
    docente = _docente()

    with pytest.raises(ValueError, match="semestre"):
        service.crear_programacion(
            salon.id,
            docente.id,
            "00000000-0000-0000-0000-000000000000",
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )


def test_crear_programacion_con_referencias_validas_delega_al_repository():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()

    programacion = service.crear_programacion(
        salon.id,
        docente.id,
        semestre.id,
        DiaSemana.LUNES,
        datetime.time(8, 0),
        datetime.time(10, 0),
        "Cálculo I",
    )

    assert programacion.salon_id == salon.id
    assert programacion.docente_id == docente.id
    assert programacion.semestre_id == semestre.id


# ------------------------------------------------------------------
# crear_programacion — validación de solapamiento
# ------------------------------------------------------------------


def test_crear_programacion_con_solapamiento_en_mismo_salon_y_dia_da_value_error_claro():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_programacion(
            salon.id, docente.id, semestre.id, DiaSemana.LUNES,
            datetime.time(9, 0), datetime.time(11, 0), "Álgebra",
        )


def test_crear_programacion_con_horas_adyacentes_no_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    # No debe lanzar: 10:00 es el fin de la primera y el inicio de la
    # segunda, franjas adyacentes que no se solapan (ver domain.py).
    segunda = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(10, 0), datetime.time(12, 0), "Álgebra",
    )

    assert segunda.materia == "Álgebra"


def test_crear_programacion_mismo_salon_distinto_dia_no_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    martes = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.MARTES,
        datetime.time(8, 0), datetime.time(10, 0), "Álgebra",
    )

    assert martes.dia == DiaSemana.MARTES


def test_crear_programacion_mismas_horas_en_otro_salon_no_da_value_error():
    salon_1 = _salon("101")
    salon_2 = _salon("102")
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon_1.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    en_otro_salon = service.crear_programacion(
        salon_2.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Álgebra",
    )

    assert en_otro_salon.salon_id == salon_2.id


# ------------------------------------------------------------------
# crear_programacion — validación cruzada RF15: contra ReservaIndividual
# ya aprobada (fuente puntual, ver docstring de service.crear_programacion
# y programacion.domain.dia_semana_de_fecha).
# ------------------------------------------------------------------


def test_crear_programacion_con_solapamiento_contra_reserva_individual_aprobada_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    # Lunes 9 de marzo de 2026 cae dentro del semestre (2026-01-15 a
    # 2026-06-15) y es un lunes real (ver DIAS_SEMANA/dia_semana_de_fecha).
    reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(9, 0), datetime.time(11, 0),
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_programacion(
            salon.id, docente.id, semestre.id, DiaSemana.LUNES,
            datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
        )


def test_crear_programacion_sin_choque_contra_reserva_individual_no_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(10, 0), datetime.time(12, 0),
    )

    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert creada.materia == "Cálculo I"


def test_crear_programacion_no_choca_con_reserva_individual_cancelada():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    reserva = reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    reservas_service.cancelar_reserva(reserva.id)

    # No debe lanzar: la reserva individual está cancelada, no bloquea.
    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert creada.materia == "Cálculo I"


def test_crear_programacion_no_choca_con_reserva_individual_fuera_del_semestre():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    # Lunes 6 de julio de 2026, fuera del rango del semestre (termina el
    # 2026-06-15): no debe considerarse para la validación cruzada.
    reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 7, 6),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert creada.materia == "Cálculo I"


# ------------------------------------------------------------------
# existe_solapamiento_en_salon — pieza reutilizable
# ------------------------------------------------------------------


def test_existe_solapamiento_en_salon_true_cuando_choca():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert service.existe_solapamiento_en_salon(
        salon.id, DiaSemana.LUNES, datetime.time(9, 0), datetime.time(11, 0)
    ) is True


def test_existe_solapamiento_en_salon_false_cuando_no_hay_nada_programado():
    salon = _salon()

    assert service.existe_solapamiento_en_salon(
        salon.id, DiaSemana.LUNES, datetime.time(9, 0), datetime.time(11, 0)
    ) is False


# ------------------------------------------------------------------
# listar / obtener
# ------------------------------------------------------------------


def test_obtener_programacion_inexistente_devuelve_none():
    assert service.obtener_programacion("00000000-0000-0000-0000-000000000000") is None


def test_obtener_programacion_existente_la_devuelve():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert service.obtener_programacion(creada.id).id == creada.id


def test_listar_programaciones_por_salon_y_dia_delega_al_repository():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    resultado = service.listar_programaciones_por_salon_y_dia(salon.id, DiaSemana.LUNES)

    assert [p.materia for p in resultado] == ["Cálculo I"]


def test_listar_programaciones_por_docente_delega_al_repository():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    resultado = service.listar_programaciones_por_docente(docente.id)

    assert [p.materia for p in resultado] == ["Cálculo I"]
