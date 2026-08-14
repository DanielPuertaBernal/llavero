"""
Tests de reservas_semestrales/service.py — la lógica que agrega valor sobre
el repository: validación de FKs cross-módulo (salon_id vía
catalogos.service, solicitante_id vía comunidad.service, semestre_id vía
programacion.service), la validación de solapamiento contra otras
reserva_semestral y contra Programacion (ver docstring de service.py y
domain.hay_solapamiento), la atomicidad de
crear_grupo_reservas_semestrales, y cancelar_grupo. Los passthrough
directos ya están cubiertos transitivamente por test_repository.py.
"""

import datetime

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import service as programacion_service
from reservas import service as reservas_service
from reservas_semestrales import repository, service
from reservas_semestrales.model import DiaSemana

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


# ------------------------------------------------------------------
# crear_grupo_reservas_semestrales — validación de referencias
# ------------------------------------------------------------------


def test_crear_grupo_sin_franjas_da_value_error_claro():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(ValueError, match="al menos una franja"):
        service.crear_grupo_reservas_semestrales(salon.id, solicitante.id, semestre.id, [])


def test_crear_grupo_con_salon_inexistente_da_value_error_claro():
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(ValueError, match="salon"):
        service.crear_grupo_reservas_semestrales(
            "00000000-0000-0000-0000-000000000000",
            solicitante.id,
            semestre.id,
            [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
        )


def test_crear_grupo_con_solicitante_inexistente_da_value_error_claro():
    salon = _salon()
    semestre = _semestre()

    with pytest.raises(ValueError, match="solicitante"):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            semestre.id,
            [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
        )


def test_crear_grupo_con_semestre_inexistente_da_value_error_claro():
    salon = _salon()
    solicitante = _persona()

    with pytest.raises(ValueError, match="semestre"):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            solicitante.id,
            "00000000-0000-0000-0000-000000000000",
            [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
        )


# ------------------------------------------------------------------
# crear_grupo_reservas_semestrales — caso de uso multi-franja
# ------------------------------------------------------------------


def test_crear_grupo_con_varias_franjas_comparten_grupo_id():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    creadas = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [
            {"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
            {"dia": DiaSemana.MIERCOLES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
        ],
    )

    assert len(creadas) == 2
    assert creadas[0].grupo_id == creadas[1].grupo_id
    assert {c.dia for c in creadas} == {DiaSemana.LUNES, DiaSemana.MIERCOLES}


def test_crear_grupo_nace_con_creado_manualmente_true_por_defecto():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    [creada] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    assert creada.creado_manualmente is True


def test_crear_grupo_con_creado_manualmente_false_para_carga_institucional():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    creadas = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
        creado_manualmente=False,
    )

    assert all(c.creado_manualmente is False for c in creadas)


def test_crear_grupo_con_franja_horario_invalido_da_value_error_claro():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(ValueError, match="anterior"):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            solicitante.id,
            semestre.id,
            [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(10, 0), "hora_fin": datetime.time(8, 0)}],
        )


def test_crear_grupo_con_franjas_que_se_solapan_entre_si_da_value_error_y_no_crea_nada():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(ValueError, match="solapa"):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            solicitante.id,
            semestre.id,
            [
                {"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
                {"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(9, 0), "hora_fin": datetime.time(11, 0)},
            ],
        )

    # Todo-o-nada: ni siquiera la primera franja (válida por sí sola)
    # debe haber quedado persistida.
    assert repository.listar_por_salon_y_dia(salon.id, DiaSemana.LUNES) == []


def test_crear_grupo_con_una_franja_invalida_hace_rollback_de_las_validas():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(ValueError):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            solicitante.id,
            semestre.id,
            [
                {"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
                {"dia": DiaSemana.MARTES, "hora_inicio": datetime.time(10, 0), "hora_fin": datetime.time(8, 0)},
            ],
        )

    assert repository.listar_reservas_semestrales() == []


# ------------------------------------------------------------------
# crear_grupo_reservas_semestrales — solapamiento contra otras
# reserva_semestral ya existentes
# ------------------------------------------------------------------


def test_crear_grupo_con_solapamiento_contra_reserva_semestral_existente_da_value_error():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            solicitante.id,
            semestre.id,
            [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(9, 0), "hora_fin": datetime.time(11, 0)}],
        )


def test_crear_grupo_con_horas_adyacentes_no_da_value_error():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    # No debe lanzar: 10:00 es el fin de la primera y el inicio de la
    # segunda, franjas adyacentes que no se solapan (ver domain.py).
    [segunda] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(10, 0), "hora_fin": datetime.time(12, 0)}],
    )

    assert segunda.hora_inicio == datetime.time(10, 0)


def test_crear_grupo_mismo_salon_distinto_dia_no_da_value_error():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    [otro_dia] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.MARTES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    assert otro_dia.dia == DiaSemana.MARTES


# ------------------------------------------------------------------
# crear_grupo_reservas_semestrales — solapamiento contra Programacion
# ------------------------------------------------------------------


def test_crear_grupo_con_solapamiento_contra_programacion_da_value_error():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    docente = _persona("1000000002", "Docente Prueba")
    programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    with pytest.raises(ValueError, match="programada"):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            solicitante.id,
            semestre.id,
            [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(9, 0), "hora_fin": datetime.time(11, 0)}],
        )


def test_crear_grupo_sin_choque_contra_programacion_no_da_value_error():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    docente = _persona("1000000002", "Docente Prueba")
    programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    [creada] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(10, 0), "hora_fin": datetime.time(12, 0)}],
    )

    assert creada.hora_inicio == datetime.time(10, 0)


# ------------------------------------------------------------------
# crear_grupo_reservas_semestrales — solapamiento contra ReservaIndividual
# (RF15: validación cruzada, ver docstring de
# service._existe_solapamiento_con_reserva_individual_aprobada en
# programacion/service.py para el detalle del cruce recurrente-puntual,
# reusado acá con la misma lógica).
# ------------------------------------------------------------------


def test_crear_grupo_con_solapamiento_contra_reserva_individual_aprobada_da_value_error():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    otro_solicitante = _persona("1000000002", "Solicitante Dos")
    # Lunes 9 de marzo de 2026, dentro del rango del semestre.
    reservas_service.crear_reserva(
        salon.id, otro_solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(9, 0), datetime.time(11, 0),
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_grupo_reservas_semestrales(
            salon.id,
            solicitante.id,
            semestre.id,
            [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
        )


def test_crear_grupo_sin_choque_contra_reserva_individual_no_da_value_error():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    otro_solicitante = _persona("1000000002", "Solicitante Dos")
    reservas_service.crear_reserva(
        salon.id, otro_solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(10, 0), datetime.time(12, 0),
    )

    [creada] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    assert creada.dia == DiaSemana.LUNES


def test_crear_grupo_no_choca_con_reserva_individual_cancelada():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    otro_solicitante = _persona("1000000002", "Solicitante Dos")
    reserva = reservas_service.crear_reserva(
        salon.id, otro_solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    reservas_service.cancelar_reserva(reserva.id)

    [creada] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    assert creada.dia == DiaSemana.LUNES


def test_crear_grupo_no_choca_con_reserva_individual_fuera_del_semestre():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    otro_solicitante = _persona("1000000002", "Solicitante Dos")
    # Lunes 6 de julio de 2026, fuera del rango del semestre (termina el
    # 2026-06-15).
    reservas_service.crear_reserva(
        salon.id, otro_solicitante.id, datetime.date(2026, 7, 6),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    [creada] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
    )

    assert creada.dia == DiaSemana.LUNES


# ------------------------------------------------------------------
# crear_reserva_semestral — atajo de una sola franja
# ------------------------------------------------------------------


def test_crear_reserva_semestral_delega_en_crear_grupo():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    creada = service.crear_reserva_semestral(
        salon.id, solicitante.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert creada.salon_id == salon.id
    assert creada.dia == DiaSemana.LUNES
    assert creada.grupo_id is not None


def test_crear_reserva_semestral_con_solapamiento_da_value_error_claro():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    service.crear_reserva_semestral(
        salon.id, solicitante.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_reserva_semestral(
            salon.id, solicitante.id, semestre.id, DiaSemana.LUNES,
            datetime.time(9, 0), datetime.time(11, 0),
        )


# ------------------------------------------------------------------
# existe_solapamiento_en_salon_semestral — pieza reutilizable
# ------------------------------------------------------------------


def test_existe_solapamiento_en_salon_semestral_true_cuando_choca():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    service.crear_reserva_semestral(
        salon.id, solicitante.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert service.existe_solapamiento_en_salon_semestral(
        salon.id, DiaSemana.LUNES, datetime.time(9, 0), datetime.time(11, 0)
    ) is True


def test_existe_solapamiento_en_salon_semestral_false_cuando_no_hay_nada():
    salon = _salon()

    assert service.existe_solapamiento_en_salon_semestral(
        salon.id, DiaSemana.LUNES, datetime.time(9, 0), datetime.time(11, 0)
    ) is False


# ------------------------------------------------------------------
# obtener_por_id / listar_por_grupo / listar_por_salon_y_dia
# ------------------------------------------------------------------


def test_obtener_por_id_inexistente_devuelve_none():
    assert service.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_id_existente_lo_devuelve():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    creada = service.crear_reserva_semestral(
        salon.id, solicitante.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    assert service.obtener_por_id(creada.id).id == creada.id


def test_listar_por_grupo_delega_al_repository():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    creadas = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [
            {"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
            {"dia": DiaSemana.MIERCOLES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
        ],
    )

    resultado = service.listar_por_grupo(creadas[0].grupo_id)

    assert {r.id for r in resultado} == {c.id for c in creadas}


def test_listar_por_salon_y_dia_delega_al_repository():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    creada = service.crear_reserva_semestral(
        salon.id, solicitante.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    resultado = service.listar_por_salon_y_dia(salon.id, DiaSemana.LUNES)

    assert [r.id for r in resultado] == [creada.id]


# ------------------------------------------------------------------
# listar_por_solicitante
# ------------------------------------------------------------------


def test_listar_por_solicitante_delega_al_repository():
    salon = _salon()
    semestre = _semestre()
    solicitante_1 = _persona("1000000001", "Solicitante Uno")
    solicitante_2 = _persona("1000000002", "Solicitante Dos")
    creada = service.crear_reserva_semestral(
        salon.id, solicitante_1.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0),
    )
    service.crear_reserva_semestral(
        salon.id, solicitante_2.id, semestre.id, DiaSemana.MARTES,
        datetime.time(8, 0), datetime.time(10, 0),
    )

    resultado = service.listar_por_solicitante(solicitante_1.id)

    assert [r.id for r in resultado] == [creada.id]


# ------------------------------------------------------------------
# cancelar_grupo
# ------------------------------------------------------------------


def test_cancelar_grupo_borra_todas_las_franjas_del_grupo():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    creadas = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [
            {"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
            {"dia": DiaSemana.MIERCOLES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)},
        ],
    )
    grupo_id = creadas[0].grupo_id

    eliminadas = service.cancelar_grupo(grupo_id)

    assert eliminadas == 2
    assert service.listar_por_grupo(grupo_id) == []


def test_cancelar_grupo_inexistente_devuelve_none():
    import uuid

    assert service.cancelar_grupo(uuid.uuid4()) is None


def test_cancelar_grupo_cargado_institucionalmente_da_value_error_claro():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    [creada] = service.crear_grupo_reservas_semestrales(
        salon.id,
        solicitante.id,
        semestre.id,
        [{"dia": DiaSemana.LUNES, "hora_inicio": datetime.time(8, 0), "hora_fin": datetime.time(10, 0)}],
        creado_manualmente=False,
    )

    with pytest.raises(ValueError, match="institucionalmente"):
        service.cancelar_grupo(creada.grupo_id)

    # No debe haber borrado nada.
    assert service.listar_por_grupo(creada.grupo_id) != []
