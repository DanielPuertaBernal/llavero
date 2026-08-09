"""
Tests de novedades/service.py — la lógica que agrega valor sobre el
repository: validación de FK cross-módulo (registrado_por_id vía
usuarios.service) y la validación de negocio "no cerrar sin solución"
(domain.validar_cierre). Los passthrough directos ya están cubiertos
transitivamente por test_repository.py.
"""

import pytest

from catalogos import service as catalogos_service
from novedades import repository, service
from novedades.model import CategoriaNovedad, EstadoNovedad
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


# ------------------------------------------------------------------
# crear_novedad — validación de referencias
# ------------------------------------------------------------------


def test_crear_novedad_con_registrado_por_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="registrado_por"):
        service.crear_novedad(
            CategoriaNovedad.DANO, "00000000-0000-0000-0000-000000000000"
        )


def test_crear_novedad_con_referencia_valida_delega_al_repository():
    usuario = _usuario()

    novedad = service.crear_novedad(
        CategoriaNovedad.PERDIDA, usuario.id, descripcion="Se extravió el equipo"
    )

    assert novedad.categoria == CategoriaNovedad.PERDIDA
    assert novedad.registrado_por_id == usuario.id
    assert novedad.descripcion == "Se extravió el equipo"


def test_crear_novedad_nace_siempre_abierta():
    usuario = _usuario()

    novedad = service.crear_novedad(CategoriaNovedad.OTRO, usuario.id)

    assert novedad.estado == EstadoNovedad.ABIERTA


# ------------------------------------------------------------------
# obtener_novedad / listar_novedades
# ------------------------------------------------------------------


def test_obtener_novedad_inexistente_devuelve_none():
    assert service.obtener_novedad("00000000-0000-0000-0000-000000000000") is None


def test_obtener_novedad_existente_la_devuelve():
    usuario = _usuario()
    creada = service.crear_novedad(CategoriaNovedad.DANO, usuario.id)

    assert service.obtener_novedad(creada.id).id == creada.id


def test_listar_novedades_delega_al_repository():
    usuario = _usuario()
    service.crear_novedad(CategoriaNovedad.DANO, usuario.id)

    categorias = {n.categoria for n in service.listar_novedades()}

    assert CategoriaNovedad.DANO in categorias


# ------------------------------------------------------------------
# listar_novedades_por_estado / listar_novedades_por_categoria
# ------------------------------------------------------------------


def test_listar_novedades_por_estado_solo_devuelve_ese_estado():
    usuario = _usuario()
    abierta = service.crear_novedad(CategoriaNovedad.DANO, usuario.id)
    cerrada = service.crear_novedad(CategoriaNovedad.PERDIDA, usuario.id)
    service.cerrar_novedad(cerrada.id, "Se recuperó el equipo perdido")

    resultado = service.listar_novedades_por_estado(EstadoNovedad.ABIERTA)

    assert abierta.id in {n.id for n in resultado}
    assert cerrada.id not in {n.id for n in resultado}


def test_listar_novedades_por_categoria_solo_devuelve_esa_categoria():
    usuario = _usuario()
    dano = service.crear_novedad(CategoriaNovedad.DANO, usuario.id)
    perdida = service.crear_novedad(CategoriaNovedad.PERDIDA, usuario.id)

    resultado = service.listar_novedades_por_categoria(CategoriaNovedad.DANO)

    assert dano.id in {n.id for n in resultado}
    assert perdida.id not in {n.id for n in resultado}


# ------------------------------------------------------------------
# cerrar_novedad — transición abierta -> cerrada
# ------------------------------------------------------------------


def test_cerrar_novedad_transiciona_de_abierta_a_cerrada():
    usuario = _usuario()
    creada = service.crear_novedad(CategoriaNovedad.DANO, usuario.id)
    assert creada.estado == EstadoNovedad.ABIERTA

    cerrada = service.cerrar_novedad(creada.id, "Se repuso la llave dañada")

    assert cerrada.estado == EstadoNovedad.CERRADA
    assert cerrada.solucion == "Se repuso la llave dañada"


def test_cerrar_novedad_sin_solucion_da_value_error_claro():
    usuario = _usuario()
    creada = service.crear_novedad(CategoriaNovedad.DANO, usuario.id)

    with pytest.raises(ValueError, match="solución"):
        service.cerrar_novedad(creada.id, "")

    # No debe haber mutado el estado en la base de datos.
    assert repository.obtener_por_id(creada.id).estado == EstadoNovedad.ABIERTA


def test_cerrar_novedad_inexistente_devuelve_none():
    assert service.cerrar_novedad(
        "00000000-0000-0000-0000-000000000000", "solución"
    ) is None
