"""
Tests de novedades/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

El fixture cross-módulo (usuario que registra la novedad) se crea vía la
API pública de `usuarios.service`, nunca vía `usuarios.repository`/
`usuarios.model` — la regla dura de módulos aplica también en tests (ver
monitores/tests/test_repository.py).
"""

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from novedades import repository
from novedades.model import CategoriaNovedad, EstadoNovedad
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


# ------------------------------------------------------------------
# crear_novedad
# ------------------------------------------------------------------


def test_crear_novedad_la_persiste_con_sus_valores():
    usuario = _usuario()

    novedad = repository.crear_novedad(
        CategoriaNovedad.DANO,
        usuario.id,
        descripcion="Llave doblada al intentar abrir el salón",
    )

    assert novedad.id is not None
    assert novedad.categoria == CategoriaNovedad.DANO
    assert novedad.descripcion == "Llave doblada al intentar abrir el salón"
    assert novedad.registrado_por_id == usuario.id
    # estado/solucion: valores por defecto del DDL (ver model.py).
    assert novedad.estado == EstadoNovedad.ABIERTA
    assert novedad.solucion is None


def test_crear_novedad_sin_descripcion_lo_permite():
    usuario = _usuario()

    novedad = repository.crear_novedad(CategoriaNovedad.OTRO, usuario.id)

    assert novedad.descripcion is None


def test_crear_novedad_con_categoria_invalida_falla_por_check_constraint():
    # "invalida" cabe en max_length=10 (CharField): el CHECK, no un
    # truncamiento de columna, es lo que debe rechazar este valor.
    usuario = _usuario()

    with pytest.raises(IntegrityError):
        repository.crear_novedad("invalida", usuario.id)


def test_crear_novedad_con_registrado_por_inexistente_falla_por_fk():
    with pytest.raises(IntegrityError):
        repository.crear_novedad(
            CategoriaNovedad.PERDIDA, "00000000-0000-0000-0000-000000000000"
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# obtener_por_id / listar_novedades
# ------------------------------------------------------------------


def test_obtener_por_id_inexistente_devuelve_none():
    assert repository.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_id_existente_lo_devuelve():
    usuario = _usuario()
    creada = repository.crear_novedad(CategoriaNovedad.DANO, usuario.id)

    assert repository.obtener_por_id(creada.id).id == creada.id


def test_listar_novedades():
    usuario = _usuario()
    repository.crear_novedad(CategoriaNovedad.DANO, usuario.id, descripcion="a")
    repository.crear_novedad(CategoriaNovedad.PERDIDA, usuario.id, descripcion="b")

    categorias = {n.categoria for n in repository.listar_novedades()}

    assert {CategoriaNovedad.DANO, CategoriaNovedad.PERDIDA} <= categorias


# ------------------------------------------------------------------
# listar_por_estado / listar_por_categoria
# ------------------------------------------------------------------


def test_listar_por_estado():
    usuario = _usuario()
    abierta = repository.crear_novedad(CategoriaNovedad.DANO, usuario.id)
    cerrada = repository.crear_novedad(CategoriaNovedad.PERDIDA, usuario.id)
    repository.cerrar_novedad(cerrada.id, "Se recuperó el equipo perdido")

    resultado = repository.listar_por_estado(EstadoNovedad.ABIERTA)

    assert {n.id for n in resultado} >= {abierta.id}
    assert cerrada.id not in {n.id for n in resultado}


def test_listar_por_categoria():
    usuario = _usuario()
    dano = repository.crear_novedad(CategoriaNovedad.DANO, usuario.id)
    perdida = repository.crear_novedad(CategoriaNovedad.PERDIDA, usuario.id)

    resultado = repository.listar_por_categoria(CategoriaNovedad.DANO)

    assert {n.id for n in resultado} >= {dano.id}
    assert perdida.id not in {n.id for n in resultado}


# ------------------------------------------------------------------
# cerrar_novedad
# ------------------------------------------------------------------


def test_cerrar_novedad_pone_estado_cerrada_y_guarda_solucion():
    usuario = _usuario()
    creada = repository.crear_novedad(CategoriaNovedad.DANO, usuario.id)

    cerrada = repository.cerrar_novedad(creada.id, "Se repuso la llave dañada")

    assert cerrada.estado == EstadoNovedad.CERRADA
    assert cerrada.solucion == "Se repuso la llave dañada"
    persistida = repository.obtener_por_id(creada.id)
    assert persistida.estado == EstadoNovedad.CERRADA
    assert persistida.solucion == "Se repuso la llave dañada"


def test_cerrar_novedad_inexistente_devuelve_none():
    assert repository.cerrar_novedad(
        "00000000-0000-0000-0000-000000000000", "solución"
    ) is None
