"""
Tests de prestamos/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

Los fixtures cross-módulo (persona, usuario, ubicación, equipo, novedad)
se crean vía la API pública de cada módulo (`catalogos.service`,
`comunidad.service`, `usuarios.service`, `equipos.service`,
`novedades.service`), nunca vía sus `repository`/`model` — la regla dura
de módulos aplica también en tests (ver `llaves/tests/test_repository.py`).
"""

import datetime

import pytest
from django.db import IntegrityError, connection
from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from equipos import service as equipos_service
from novedades import service as novedades_service
from prestamos import repository
from prestamos.model import EstadoDetalleEquipo, EstadoPrestamo
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _ubicacion(nombre="ubicacion-1", permite_prestamo_equipos=True):
    return catalogos_service.crear_ubicacion(
        nombre, permite_prestamo_equipos=permite_prestamo_equipos
    )


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-usuario-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


def _equipo(codigo="EQ-001", nombre="Equipo Prueba"):
    return equipos_service.crear_equipo(nombre, codigo)


def _novedad(usuario):
    return novedades_service.crear_novedad("dano", usuario.id)


def _prestamo(solicitante=None, usuario_prestamista=None, ubicacion=None):
    solicitante = solicitante or _persona()
    usuario_prestamista = usuario_prestamista or _usuario()
    ubicacion = ubicacion or _ubicacion()
    return repository.crear_prestamo(
        solicitante.id, usuario_prestamista.id, ubicacion.id
    )


# ------------------------------------------------------------------
# crear_prestamo
# ------------------------------------------------------------------


def test_crear_prestamo_lo_persiste_con_sus_valores_y_defaults():
    solicitante = _persona()
    usuario_prestamista = _usuario()
    ubicacion = _ubicacion()

    prestamo = repository.crear_prestamo(
        solicitante.id, usuario_prestamista.id, ubicacion.id
    )

    assert prestamo.id is not None
    assert prestamo.solicitante_id == solicitante.id
    assert prestamo.usuario_prestamista_id == usuario_prestamista.id
    assert prestamo.ubicacion_id == ubicacion.id
    # Valores por defecto del DDL (ver model.py).
    assert prestamo.estado == EstadoPrestamo.ACTIVO
    assert prestamo.fecha_creacion is not None


def test_crear_prestamo_con_solicitante_inexistente_falla_por_fk():
    usuario_prestamista = _usuario()
    ubicacion = _ubicacion()

    with pytest.raises(IntegrityError):
        repository.crear_prestamo(
            "00000000-0000-0000-0000-000000000000",
            usuario_prestamista.id,
            ubicacion.id,
        )
        connection.check_constraints()


def test_crear_prestamo_con_usuario_prestamista_inexistente_falla_por_fk():
    solicitante = _persona()
    ubicacion = _ubicacion()

    with pytest.raises(IntegrityError):
        repository.crear_prestamo(
            solicitante.id,
            "00000000-0000-0000-0000-000000000000",
            ubicacion.id,
        )
        connection.check_constraints()


def test_crear_prestamo_con_ubicacion_inexistente_falla_por_fk():
    solicitante = _persona()
    usuario_prestamista = _usuario()

    with pytest.raises(IntegrityError):
        repository.crear_prestamo(
            solicitante.id,
            usuario_prestamista.id,
            "00000000-0000-0000-0000-000000000000",
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# obtener_prestamo / listar_prestamos
# ------------------------------------------------------------------


def test_obtener_prestamo_inexistente_devuelve_none():
    assert repository.obtener_prestamo("00000000-0000-0000-0000-000000000000") is None


def test_obtener_prestamo_existente_lo_devuelve():
    creado = _prestamo()

    assert repository.obtener_prestamo(creado.id).id == creado.id


def test_listar_prestamos():
    _prestamo()
    _prestamo(
        solicitante=_persona("1000000002", "Persona Dos"),
        usuario_prestamista=_usuario("usuario-2@uco.edu.co", "Usuario Dos"),
        ubicacion=_ubicacion("ubicacion-2"),
    )

    assert len(repository.listar_prestamos()) >= 2


# ------------------------------------------------------------------
# listar_prestamos_por_solicitante / listar_prestamos_por_estado
# ------------------------------------------------------------------


def test_listar_prestamos_por_solicitante_solo_devuelve_los_de_ese_solicitante():
    solicitante_1 = _persona("1000000001", "Solicitante Uno")
    solicitante_2 = _persona("1000000002", "Solicitante Dos")
    usuario_prestamista = _usuario()
    ubicacion = _ubicacion()
    de_1 = _prestamo(solicitante_1, usuario_prestamista, ubicacion)
    de_2 = _prestamo(solicitante_2, usuario_prestamista, ubicacion)

    resultado = repository.listar_prestamos_por_solicitante(solicitante_1.id)

    assert {p.id for p in resultado} == {de_1.id}
    assert de_2.id not in {p.id for p in resultado}


def test_listar_prestamos_por_estado_solo_devuelve_ese_estado():
    activo = _prestamo()
    otro = _prestamo(
        solicitante=_persona("1000000002", "Persona Dos"),
        usuario_prestamista=_usuario("usuario-2@uco.edu.co", "Usuario Dos"),
        ubicacion=_ubicacion("ubicacion-2"),
    )
    repository.actualizar_estado_prestamo(
        otro.id, EstadoPrestamo.COMPLETAMENTE_DEVUELTO
    )

    resultado = repository.listar_prestamos_por_estado(EstadoPrestamo.ACTIVO)

    assert activo.id in {p.id for p in resultado}
    assert otro.id not in {p.id for p in resultado}


# ------------------------------------------------------------------
# actualizar_estado_prestamo
# ------------------------------------------------------------------


def test_actualizar_estado_prestamo_lo_actualiza():
    prestamo = _prestamo()

    actualizado = repository.actualizar_estado_prestamo(
        prestamo.id, EstadoPrestamo.PARCIALMENTE_DEVUELTO
    )

    assert actualizado.estado == EstadoPrestamo.PARCIALMENTE_DEVUELTO
    assert (
        repository.obtener_prestamo(prestamo.id).estado
        == EstadoPrestamo.PARCIALMENTE_DEVUELTO
    )


def test_actualizar_estado_prestamo_inexistente_devuelve_none():
    assert (
        repository.actualizar_estado_prestamo(
            "00000000-0000-0000-0000-000000000000", EstadoPrestamo.ACTIVO
        )
        is None
    )


def test_actualizar_estado_prestamo_con_estado_invalido_falla_por_check_constraint():
    prestamo = _prestamo()

    with pytest.raises(IntegrityError):
        repository.actualizar_estado_prestamo(prestamo.id, "invalido")


# ------------------------------------------------------------------
# crear_detalle_prestamo
# ------------------------------------------------------------------


def test_crear_detalle_prestamo_lo_persiste_con_sus_valores_y_defaults():
    prestamo = _prestamo()
    equipo = _equipo()

    detalle = repository.crear_detalle_prestamo(prestamo.id, equipo.id)

    assert detalle.id is not None
    assert detalle.prestamo_id == prestamo.id
    assert detalle.equipo_id == equipo.id
    # Valores por defecto del DDL (ver model.py).
    assert detalle.estado_equipo == EstadoDetalleEquipo.ENTREGADO
    assert detalle.fecha_entrega is not None
    assert detalle.fecha_devolucion is None
    assert detalle.novedad_id is None


def test_crear_detalle_prestamo_con_prestamo_inexistente_falla_por_fk():
    equipo = _equipo()

    with pytest.raises(IntegrityError):
        repository.crear_detalle_prestamo(
            "00000000-0000-0000-0000-000000000000", equipo.id
        )
        connection.check_constraints()


def test_crear_detalle_prestamo_con_equipo_inexistente_falla_por_fk():
    prestamo = _prestamo()

    with pytest.raises(IntegrityError):
        repository.crear_detalle_prestamo(
            prestamo.id, "00000000-0000-0000-0000-000000000000"
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# idx_equipo_entregado_unico
# ------------------------------------------------------------------


def test_dos_detalles_entregados_del_mismo_equipo_falla_por_unicidad():
    equipo = _equipo()
    repository.crear_detalle_prestamo(_prestamo().id, equipo.id)

    # Segundo préstamo con solicitante/prestamista/ubicación propios: con la
    # validación de unicidad de catalogos (`crear_tipo_persona`/`crear_rol`)
    # ya no se puede reusar `_prestamo()` con sus defaults acá, porque
    # colisionaría con el primero ANTES de llegar al IntegrityError que este
    # test quiere probar (el de `idx_equipo_entregado_unico`), igual que en
    # `test_nuevo_detalle_del_mismo_equipo_tras_devolver_el_anterior_no_falla`.
    otro_prestamo = _prestamo(
        solicitante=_persona("1000000002", "Persona Dos"),
        usuario_prestamista=_usuario("usuario-2@uco.edu.co", "Usuario Dos"),
        ubicacion=_ubicacion("ubicacion-2"),
    )

    with pytest.raises(IntegrityError):
        repository.crear_detalle_prestamo(otro_prestamo.id, equipo.id)


def test_nuevo_detalle_del_mismo_equipo_tras_devolver_el_anterior_no_falla():
    equipo = _equipo()
    primer_detalle = repository.crear_detalle_prestamo(_prestamo().id, equipo.id)
    repository.marcar_detalle_devuelto(primer_detalle.id, timezone.now())

    otro_prestamo = _prestamo(
        solicitante=_persona("1000000002", "Persona Dos"),
        usuario_prestamista=_usuario("usuario-2@uco.edu.co", "Usuario Dos"),
        ubicacion=_ubicacion("ubicacion-2"),
    )
    segundo_detalle = repository.crear_detalle_prestamo(otro_prestamo.id, equipo.id)

    assert segundo_detalle.id is not None
    assert segundo_detalle.equipo_id == equipo.id


# ------------------------------------------------------------------
# listar_detalles_por_prestamo / obtener_detalle_por_prestamo_y_equipo
# ------------------------------------------------------------------


def test_listar_detalles_por_prestamo_solo_devuelve_los_de_ese_prestamo():
    prestamo_1 = _prestamo()
    prestamo_2 = _prestamo(
        solicitante=_persona("1000000002", "Persona Dos"),
        usuario_prestamista=_usuario("usuario-2@uco.edu.co", "Usuario Dos"),
        ubicacion=_ubicacion("ubicacion-2"),
    )
    detalle_1 = repository.crear_detalle_prestamo(prestamo_1.id, _equipo("EQ-001").id)
    detalle_2 = repository.crear_detalle_prestamo(prestamo_2.id, _equipo("EQ-002").id)

    resultado = repository.listar_detalles_por_prestamo(prestamo_1.id)

    assert {d.id for d in resultado} == {detalle_1.id}
    assert detalle_2.id not in {d.id for d in resultado}


def test_obtener_detalle_por_prestamo_y_equipo_inexistente_devuelve_none():
    prestamo = _prestamo()

    assert (
        repository.obtener_detalle_por_prestamo_y_equipo(
            prestamo.id, "00000000-0000-0000-0000-000000000000"
        )
        is None
    )


def test_obtener_detalle_por_prestamo_y_equipo_existente_lo_devuelve():
    prestamo = _prestamo()
    equipo = _equipo()
    creado = repository.crear_detalle_prestamo(prestamo.id, equipo.id)

    encontrado = repository.obtener_detalle_por_prestamo_y_equipo(prestamo.id, equipo.id)

    assert encontrado.id == creado.id


# ------------------------------------------------------------------
# existe_detalle_entregado_para_equipo
# ------------------------------------------------------------------


def test_existe_detalle_entregado_para_equipo_true_cuando_esta_entregado():
    equipo = _equipo()
    repository.crear_detalle_prestamo(_prestamo().id, equipo.id)

    assert repository.existe_detalle_entregado_para_equipo(equipo.id) is True


def test_existe_detalle_entregado_para_equipo_false_cuando_no_hay_nada():
    equipo = _equipo()

    assert repository.existe_detalle_entregado_para_equipo(equipo.id) is False


def test_existe_detalle_entregado_para_equipo_false_tras_devolverlo():
    equipo = _equipo()
    detalle = repository.crear_detalle_prestamo(_prestamo().id, equipo.id)
    repository.marcar_detalle_devuelto(detalle.id, timezone.now())

    assert repository.existe_detalle_entregado_para_equipo(equipo.id) is False


# ------------------------------------------------------------------
# marcar_detalle_devuelto
# ------------------------------------------------------------------


def test_marcar_detalle_devuelto_pone_estado_devuelto_y_guarda_la_fecha():
    usuario = _usuario("usuario-novedad@uco.edu.co", "Usuario Novedad")
    novedad = _novedad(usuario)
    detalle = repository.crear_detalle_prestamo(_prestamo().id, _equipo().id)
    ahora = timezone.now()

    devuelto = repository.marcar_detalle_devuelto(detalle.id, ahora, novedad_id=novedad.id)

    assert devuelto.estado_equipo == EstadoDetalleEquipo.DEVUELTO
    assert devuelto.fecha_devolucion == ahora
    assert devuelto.novedad_id == novedad.id
    persistido = repository.obtener_detalle_por_prestamo_y_equipo(
        devuelto.prestamo_id, devuelto.equipo_id
    )
    assert persistido.estado_equipo == EstadoDetalleEquipo.DEVUELTO
    assert persistido.fecha_devolucion == ahora


def test_marcar_detalle_devuelto_sin_novedad_lo_permite():
    detalle = repository.crear_detalle_prestamo(_prestamo().id, _equipo().id)

    devuelto = repository.marcar_detalle_devuelto(detalle.id, timezone.now())

    assert devuelto.novedad_id is None


def test_marcar_detalle_devuelto_inexistente_devuelve_none():
    assert (
        repository.marcar_detalle_devuelto(
            "00000000-0000-0000-0000-000000000000", timezone.now()
        )
        is None
    )


def test_marcar_detalle_devuelto_con_fecha_anterior_a_la_entrega_falla_por_check_constraint():
    # CHECK (fecha_devolucion IS NULL OR fecha_devolucion > fecha_entrega)
    # del DDL: se fuerza pasando una fecha anterior a la de entrega —
    # repository.marcar_detalle_devuelto recibe la fecha ya calculada
    # desde afuera (ver docstring del módulo), lo que permite este test
    # sin mockear el reloj.
    detalle = repository.crear_detalle_prestamo(_prestamo().id, _equipo().id)
    fecha_anterior = detalle.fecha_entrega - datetime.timedelta(days=1)

    with pytest.raises(IntegrityError):
        repository.marcar_detalle_devuelto(detalle.id, fecha_anterior)


# ------------------------------------------------------------------
# crear_devolucion / listar_devoluciones_por_prestamo
# ------------------------------------------------------------------


def test_crear_devolucion_la_persiste_con_sus_valores():
    prestamo = _prestamo()
    usuario_recibe = _usuario("usuario-recibe@uco.edu.co", "Usuario Recibe")
    ubicacion = _ubicacion("ubicacion-devolucion")

    devolucion = repository.crear_devolucion(
        prestamo.id, usuario_recibe.id, ubicacion.id, True
    )

    assert devolucion.id is not None
    assert devolucion.prestamo_id == prestamo.id
    assert devolucion.usuario_recibe_id == usuario_recibe.id
    assert devolucion.ubicacion_id == ubicacion.id
    assert devolucion.es_completa is True
    assert devolucion.fecha is not None


def test_crear_devolucion_con_prestamo_inexistente_falla_por_fk():
    usuario_recibe = _usuario()
    ubicacion = _ubicacion()

    with pytest.raises(IntegrityError):
        repository.crear_devolucion(
            "00000000-0000-0000-0000-000000000000",
            usuario_recibe.id,
            ubicacion.id,
            False,
        )
        connection.check_constraints()


def test_listar_devoluciones_por_prestamo_solo_devuelve_las_de_ese_prestamo():
    prestamo_1 = _prestamo()
    prestamo_2 = _prestamo(
        solicitante=_persona("1000000002", "Persona Dos"),
        usuario_prestamista=_usuario("usuario-2@uco.edu.co", "Usuario Dos"),
        ubicacion=_ubicacion("ubicacion-2"),
    )
    usuario_recibe = _usuario("usuario-recibe@uco.edu.co", "Usuario Recibe")
    ubicacion = _ubicacion("ubicacion-devolucion")
    dev_1 = repository.crear_devolucion(
        prestamo_1.id, usuario_recibe.id, ubicacion.id, False
    )
    dev_2 = repository.crear_devolucion(
        prestamo_2.id, usuario_recibe.id, ubicacion.id, False
    )

    resultado = repository.listar_devoluciones_por_prestamo(prestamo_1.id)

    assert {d.id for d in resultado} == {dev_1.id}
    assert dev_2.id not in {d.id for d in resultado}
