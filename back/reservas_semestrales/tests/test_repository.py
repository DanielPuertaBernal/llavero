"""
Tests de reservas_semestrales/repository.py contra una base de datos de
test real (Postgres, vía pytest-django) — sin mocks, tal como pide la
convención TDD del proyecto.

Los fixtures cross-módulo (salon, solicitante, semestre) se crean vía la
API pública de cada módulo (`catalogos.service`, `comunidad.service`,
`programacion.service`), nunca vía sus `repository`/`model` — la regla
dura de módulos aplica también en tests (ver
reservas/tests/test_repository.py).
"""

import datetime
import uuid

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import service as programacion_service
from reservas_semestrales import repository
from reservas_semestrales.model import DiaSemana, ReservaSemestral

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


def _reserva(
    salon=None,
    solicitante=None,
    semestre=None,
    dia=DiaSemana.LUNES,
    hora_inicio=None,
    hora_fin=None,
    grupo_id=None,
    creado_manualmente=True,
):
    salon = salon or _salon()
    solicitante = solicitante or _persona()
    semestre = semestre or _semestre()
    hora_inicio = hora_inicio or datetime.time(8, 0)
    hora_fin = hora_fin or datetime.time(10, 0)
    grupo_id = grupo_id or uuid.uuid4()
    return repository.crear_reserva_semestral(
        salon.id,
        solicitante.id,
        semestre.id,
        dia,
        hora_inicio,
        hora_fin,
        grupo_id,
        creado_manualmente=creado_manualmente,
    )


# ------------------------------------------------------------------
# crear_reserva_semestral
# ------------------------------------------------------------------


def test_crear_reserva_semestral_la_persiste_con_sus_valores_y_defaults():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    grupo_id = uuid.uuid4()

    reserva = repository.crear_reserva_semestral(
        salon.id,
        solicitante.id,
        semestre.id,
        DiaSemana.MIERCOLES,
        datetime.time(8, 0),
        datetime.time(10, 0),
        grupo_id,
    )

    assert reserva.id is not None
    assert reserva.salon_id == salon.id
    assert reserva.solicitante_id == solicitante.id
    assert reserva.semestre_id == semestre.id
    assert reserva.dia == DiaSemana.MIERCOLES
    assert reserva.hora_inicio == datetime.time(8, 0)
    assert reserva.hora_fin == datetime.time(10, 0)
    assert reserva.grupo_id == grupo_id
    # Valor por defecto del DDL (ver model.py).
    assert reserva.creado_manualmente is True


def test_crear_reserva_semestral_con_creado_manualmente_false():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    reserva = repository.crear_reserva_semestral(
        salon.id,
        solicitante.id,
        semestre.id,
        DiaSemana.LUNES,
        datetime.time(8, 0),
        datetime.time(10, 0),
        uuid.uuid4(),
        creado_manualmente=False,
    )

    assert reserva.creado_manualmente is False


def test_crear_reserva_semestral_con_hora_inicio_no_anterior_a_hora_fin_falla_por_check_constraint():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        repository.crear_reserva_semestral(
            salon.id,
            solicitante.id,
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(10, 0),
            datetime.time(8, 0),
            uuid.uuid4(),
        )


def test_crear_reserva_semestral_con_dia_invalido_falla_por_check_constraint():
    # repository.crear_reserva_semestral no valida `dia` en Python — se
    # fuerza el CHECK instanciando el modelo directamente, mismo recurso
    # que reservas/tests/test_repository.py usa para `estado` inválido.
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        ReservaSemestral.objects.create(
            salon_id=salon.id,
            solicitante_id=solicitante.id,
            semestre_id=semestre.id,
            dia="invalido",
            hora_inicio=datetime.time(8, 0),
            hora_fin=datetime.time(10, 0),
            grupo_id=uuid.uuid4(),
        )


def test_crear_reserva_semestral_con_salon_inexistente_falla_por_fk():
    solicitante = _persona()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        repository.crear_reserva_semestral(
            "00000000-0000-0000-0000-000000000000",
            solicitante.id,
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            uuid.uuid4(),
        )
        connection.check_constraints()


def test_crear_reserva_semestral_con_solicitante_inexistente_falla_por_fk():
    salon = _salon()
    semestre = _semestre()

    with pytest.raises(IntegrityError):
        repository.crear_reserva_semestral(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            uuid.uuid4(),
        )
        connection.check_constraints()


def test_crear_reserva_semestral_con_semestre_inexistente_falla_por_fk():
    salon = _salon()
    solicitante = _persona()

    with pytest.raises(IntegrityError):
        repository.crear_reserva_semestral(
            salon.id,
            solicitante.id,
            "00000000-0000-0000-0000-000000000000",
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            uuid.uuid4(),
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# obtener_por_id / listar_reservas_semestrales
# ------------------------------------------------------------------


def test_obtener_por_id_inexistente_devuelve_none():
    assert repository.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_id_existente_lo_devuelve():
    creada = _reserva()

    assert repository.obtener_por_id(creada.id).id == creada.id


def test_listar_reservas_semestrales():
    solicitante = _persona()
    semestre = _semestre()
    _reserva(salon=_salon("101"), solicitante=solicitante, semestre=semestre)
    _reserva(salon=_salon("102"), solicitante=solicitante, semestre=semestre)

    assert len(repository.listar_reservas_semestrales()) >= 2


# ------------------------------------------------------------------
# listar_por_grupo
# ------------------------------------------------------------------


def test_listar_por_grupo_solo_devuelve_las_de_ese_grupo():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    grupo_id = uuid.uuid4()
    del_grupo_1 = _reserva(
        salon=salon,
        solicitante=solicitante,
        semestre=semestre,
        dia=DiaSemana.LUNES,
        grupo_id=grupo_id,
    )
    del_grupo_1_otra_franja = _reserva(
        salon=salon,
        solicitante=solicitante,
        semestre=semestre,
        dia=DiaSemana.MIERCOLES,
        grupo_id=grupo_id,
    )
    de_otro_grupo = _reserva(salon=salon, solicitante=solicitante, semestre=semestre)

    resultado = repository.listar_por_grupo(grupo_id)

    assert {r.id for r in resultado} == {del_grupo_1.id, del_grupo_1_otra_franja.id}
    assert de_otro_grupo.id not in {r.id for r in resultado}


def test_listar_por_grupo_inexistente_devuelve_lista_vacia():
    assert repository.listar_por_grupo(uuid.uuid4()) == []


# ------------------------------------------------------------------
# listar_por_salon_y_dia
# ------------------------------------------------------------------


def test_listar_por_salon_y_dia_solo_devuelve_ese_salon_y_dia():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    en_salon_lunes = _reserva(salon=salon, solicitante=solicitante, semestre=semestre, dia=DiaSemana.LUNES)
    # Mismo salón, otro día: no debe aparecer.
    _reserva(salon=salon, solicitante=solicitante, semestre=semestre, dia=DiaSemana.MARTES)
    # Otro salón, mismo día: no debe aparecer.
    _reserva(salon=_salon("102"), solicitante=solicitante, semestre=semestre, dia=DiaSemana.LUNES)

    resultado = repository.listar_por_salon_y_dia(salon.id, DiaSemana.LUNES)

    assert {r.id for r in resultado} == {en_salon_lunes.id}


# ------------------------------------------------------------------
# eliminar_por_grupo
# ------------------------------------------------------------------


def test_eliminar_por_grupo_borra_todas_las_filas_del_grupo():
    salon = _salon()
    solicitante = _persona()
    semestre = _semestre()
    grupo_id = uuid.uuid4()
    _reserva(salon=salon, solicitante=solicitante, semestre=semestre, dia=DiaSemana.LUNES, grupo_id=grupo_id)
    _reserva(salon=salon, solicitante=solicitante, semestre=semestre, dia=DiaSemana.MARTES, grupo_id=grupo_id)

    borradas = repository.eliminar_por_grupo(grupo_id)

    assert borradas == 2
    assert repository.listar_por_grupo(grupo_id) == []


def test_eliminar_por_grupo_inexistente_devuelve_cero():
    assert repository.eliminar_por_grupo(uuid.uuid4()) == 0
