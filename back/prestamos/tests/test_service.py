"""
Tests de prestamos/service.py — la lógica que agrega valor sobre el
repository: validación de FKs cross-módulo de `crear_prestamo`/
`devolver_equipos`, `domain.validar_permite_prestamo` sobre la
ubicación, el pre-check de disponibilidad de equipo
(`domain.validar_equipo_disponible`, ver Nota de diseño en `model.py`
sobre por qué este módulo, a diferencia de `llaves`, sí lo agrega), la
atomicidad todo-o-nada de `crear_prestamo`/`devolver_equipos`, y la
agregación de estado de préstamo/`es_completa` de una devolución
parcial vs. completa. Los passthrough directos ya están cubiertos
transitivamente por test_repository.py.
"""

import uuid

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from equipos import service as equipos_service
from novedades import service as novedades_service
from prestamos import repository, service
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


def _fixtures(suffix="1"):
    return {
        "solicitante": _persona(f"100000000{suffix}", f"Solicitante {suffix}"),
        "usuario_prestamista": _usuario(f"prestamista{suffix}@uco.edu.co", f"Prestamista {suffix}"),
        "ubicacion": _ubicacion(f"ubicacion-prestamo-{suffix}"),
    }


def _crear_prestamo_valido(equipos=None, f=None):
    f = f or _fixtures()
    # Código de inventario único por llamada (uuid corto): esta función se
    # usa varias veces por test para crear préstamos independientes, y
    # `codigo_inventario` es UNIQUE en `equipo` (ver equipos.model) — un
    # default fijo tipo "EQ-001" chocaría en la segunda llamada.
    equipos = equipos if equipos is not None else [_equipo(f"EQ-{uuid.uuid4().hex[:8]}")]
    prestamo = service.crear_prestamo(
        f["solicitante"].id,
        f["usuario_prestamista"].id,
        f["ubicacion"].id,
        [equipo.id for equipo in equipos],
    )
    return prestamo, f, equipos


# ------------------------------------------------------------------
# crear_prestamo — validación de referencias
# ------------------------------------------------------------------


def test_crear_prestamo_sin_equipos_da_value_error_claro():
    f = _fixtures()

    with pytest.raises(ValueError, match="al menos un equipo"):
        service.crear_prestamo(
            f["solicitante"].id, f["usuario_prestamista"].id, f["ubicacion"].id, []
        )


def test_crear_prestamo_con_solicitante_inexistente_da_value_error_claro():
    f = _fixtures()
    equipo = _equipo()

    with pytest.raises(ValueError, match="solicitante"):
        service.crear_prestamo(
            "00000000-0000-0000-0000-000000000000",
            f["usuario_prestamista"].id,
            f["ubicacion"].id,
            [equipo.id],
        )


def test_crear_prestamo_con_usuario_prestamista_inexistente_da_value_error_claro():
    f = _fixtures()
    equipo = _equipo()

    with pytest.raises(ValueError, match="usuario_prestamista"):
        service.crear_prestamo(
            f["solicitante"].id,
            "00000000-0000-0000-0000-000000000000",
            f["ubicacion"].id,
            [equipo.id],
        )


def test_crear_prestamo_con_ubicacion_inexistente_da_value_error_claro():
    f = _fixtures()
    equipo = _equipo()

    with pytest.raises(ValueError, match="ubicacion"):
        service.crear_prestamo(
            f["solicitante"].id,
            f["usuario_prestamista"].id,
            "00000000-0000-0000-0000-000000000000",
            [equipo.id],
        )


def test_crear_prestamo_con_ubicacion_que_no_permite_prestamo_da_value_error_claro():
    f = _fixtures()
    equipo = _equipo()
    ubicacion_sin_prestamo = _ubicacion(
        "ubicacion-sin-prestamo", permite_prestamo_equipos=False
    )

    with pytest.raises(ValueError, match="préstamo"):
        service.crear_prestamo(
            f["solicitante"].id,
            f["usuario_prestamista"].id,
            ubicacion_sin_prestamo.id,
            [equipo.id],
        )

    assert repository.listar_prestamos() == []


def test_crear_prestamo_con_equipo_inexistente_da_value_error_y_no_crea_nada():
    f = _fixtures()

    with pytest.raises(ValueError, match="equipo"):
        service.crear_prestamo(
            f["solicitante"].id,
            f["usuario_prestamista"].id,
            f["ubicacion"].id,
            ["00000000-0000-0000-0000-000000000000"],
        )

    assert repository.listar_prestamos() == []


# ------------------------------------------------------------------
# crear_prestamo — pre-check de disponibilidad (idx_equipo_entregado_unico)
# ------------------------------------------------------------------


def test_crear_prestamo_con_equipo_ya_prestado_da_value_error_claro():
    equipo = _equipo()
    _crear_prestamo_valido(equipos=[equipo])

    f2 = _fixtures("2")
    with pytest.raises(ValueError, match="ya está prestado"):
        service.crear_prestamo(
            f2["solicitante"].id, f2["usuario_prestamista"].id, f2["ubicacion"].id, [equipo.id]
        )


def test_crear_prestamo_con_equipo_ya_prestado_no_crea_el_nuevo_prestamo():
    equipo = _equipo()
    primero, _, _ = _crear_prestamo_valido(equipos=[equipo])

    f2 = _fixtures("2")
    with pytest.raises(ValueError):
        service.crear_prestamo(
            f2["solicitante"].id, f2["usuario_prestamista"].id, f2["ubicacion"].id, [equipo.id]
        )

    assert {p.id for p in repository.listar_prestamos()} == {primero.id}


def test_crear_prestamo_con_equipo_duplicado_en_la_misma_lista_da_value_error_y_no_crea_nada():
    f = _fixtures()
    equipo = _equipo()

    with pytest.raises(ValueError, match="ya está prestado"):
        service.crear_prestamo(
            f["solicitante"].id,
            f["usuario_prestamista"].id,
            f["ubicacion"].id,
            [equipo.id, equipo.id],
        )

    assert repository.listar_prestamos() == []


def test_crear_prestamo_tras_devolver_el_equipo_no_falla():
    equipo = _equipo()
    primero, f1, _ = _crear_prestamo_valido(equipos=[equipo])
    service.devolver_equipos(primero.id, f1["usuario_prestamista"].id, f1["ubicacion"].id, [equipo.id])

    f2 = _fixtures("2")
    segundo = service.crear_prestamo(
        f2["solicitante"].id, f2["usuario_prestamista"].id, f2["ubicacion"].id, [equipo.id]
    )

    assert segundo.id is not None
    assert segundo.id != primero.id


# ------------------------------------------------------------------
# crear_prestamo — caso de uso multi-equipo, atomicidad
# ------------------------------------------------------------------


def test_crear_prestamo_con_varios_equipos_crea_un_detalle_por_cada_uno():
    equipos = [_equipo("EQ-001"), _equipo("EQ-002"), _equipo("EQ-003")]
    prestamo, _, _ = _crear_prestamo_valido(equipos=equipos)

    detalles = repository.listar_detalles_por_prestamo(prestamo.id)

    assert {d.equipo_id for d in detalles} == {e.id for e in equipos}
    assert all(d.estado_equipo == EstadoDetalleEquipo.ENTREGADO for d in detalles)


def test_crear_prestamo_nace_siempre_en_estado_activo():
    prestamo, _, _ = _crear_prestamo_valido()

    assert prestamo.estado == EstadoPrestamo.ACTIVO


def test_crear_prestamo_con_un_equipo_invalido_entre_varios_no_crea_ninguno():
    f = _fixtures()
    equipo_valido = _equipo("EQ-001")

    with pytest.raises(ValueError):
        service.crear_prestamo(
            f["solicitante"].id,
            f["usuario_prestamista"].id,
            f["ubicacion"].id,
            [equipo_valido.id, "00000000-0000-0000-0000-000000000000"],
        )

    assert repository.listar_prestamos() == []
    assert repository.existe_detalle_entregado_para_equipo(equipo_valido.id) is False


# ------------------------------------------------------------------
# obtener_prestamo / listar_prestamos / listar_prestamos_por_*
# ------------------------------------------------------------------


def test_obtener_prestamo_inexistente_devuelve_none():
    assert service.obtener_prestamo("00000000-0000-0000-0000-000000000000") is None


def test_obtener_prestamo_existente_lo_devuelve():
    creado, _, _ = _crear_prestamo_valido()

    assert service.obtener_prestamo(creado.id).id == creado.id


def test_listar_prestamos_delega_al_repository():
    creado, _, _ = _crear_prestamo_valido()

    assert creado.id in {p.id for p in service.listar_prestamos()}


def test_listar_prestamos_por_solicitante_solo_devuelve_los_de_ese_solicitante():
    f1 = _fixtures("1")
    equipo_1 = _equipo("EQ-001")
    de_1 = service.crear_prestamo(
        f1["solicitante"].id, f1["usuario_prestamista"].id, f1["ubicacion"].id, [equipo_1.id]
    )
    f2 = _fixtures("2")
    equipo_2 = _equipo("EQ-002")
    de_2 = service.crear_prestamo(
        f2["solicitante"].id, f2["usuario_prestamista"].id, f2["ubicacion"].id, [equipo_2.id]
    )

    resultado = service.listar_prestamos_por_solicitante(f1["solicitante"].id)

    assert {p.id for p in resultado} == {de_1.id}
    assert de_2.id not in {p.id for p in resultado}


def test_listar_prestamos_por_estado_solo_devuelve_ese_estado():
    activo, f, equipos = _crear_prestamo_valido(f=_fixtures("1"))
    completo, f2, equipos2 = _crear_prestamo_valido(f=_fixtures("2"))
    service.devolver_equipos(
        completo.id, f2["usuario_prestamista"].id, f2["ubicacion"].id, [equipos2[0].id]
    )

    resultado = service.listar_prestamos_por_estado(EstadoPrestamo.ACTIVO)

    assert activo.id in {p.id for p in resultado}
    assert completo.id not in {p.id for p in resultado}


def test_listar_detalles_por_prestamo_delega_al_repository():
    prestamo, _, equipos = _crear_prestamo_valido()

    resultado = service.listar_detalles_por_prestamo(prestamo.id)

    assert {d.equipo_id for d in resultado} == {e.id for e in equipos}


# ------------------------------------------------------------------
# devolver_equipos — validación de referencias
# ------------------------------------------------------------------


def test_devolver_equipos_con_prestamo_inexistente_devuelve_none():
    usuario = _usuario()
    ubicacion = _ubicacion()

    assert (
        service.devolver_equipos(
            "00000000-0000-0000-0000-000000000000",
            usuario.id,
            ubicacion.id,
            ["00000000-0000-0000-0000-000000000000"],
        )
        is None
    )


def test_devolver_equipos_con_usuario_recibe_inexistente_da_value_error_claro():
    prestamo, f, equipos = _crear_prestamo_valido()

    with pytest.raises(ValueError, match="usuario_recibe"):
        service.devolver_equipos(
            prestamo.id,
            "00000000-0000-0000-0000-000000000000",
            f["ubicacion"].id,
            [equipos[0].id],
        )


def test_devolver_equipos_con_ubicacion_inexistente_da_value_error_claro():
    prestamo, f, equipos = _crear_prestamo_valido()

    with pytest.raises(ValueError, match="ubicacion"):
        service.devolver_equipos(
            prestamo.id,
            f["usuario_prestamista"].id,
            "00000000-0000-0000-0000-000000000000",
            [equipos[0].id],
        )


def test_devolver_equipos_con_novedad_inexistente_da_value_error_claro():
    prestamo, f, equipos = _crear_prestamo_valido()

    with pytest.raises(ValueError, match="novedad"):
        service.devolver_equipos(
            prestamo.id,
            f["usuario_prestamista"].id,
            f["ubicacion"].id,
            [equipos[0].id],
            novedades_por_equipo={equipos[0].id: "00000000-0000-0000-0000-000000000000"},
        )


def test_devolver_equipos_sin_equipos_da_value_error_claro():
    prestamo, f, _ = _crear_prestamo_valido()

    with pytest.raises(ValueError, match="al menos un equipo"):
        service.devolver_equipos(prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [])


def test_devolver_equipos_con_equipo_que_no_pertenece_al_prestamo_da_value_error_claro():
    prestamo, f, _ = _crear_prestamo_valido()
    otro_equipo = _equipo("EQ-OTRO")

    with pytest.raises(ValueError, match="no pertenece"):
        service.devolver_equipos(
            prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [otro_equipo.id]
        )


def test_devolver_equipos_con_equipo_ya_devuelto_da_value_error_claro():
    prestamo, f, equipos = _crear_prestamo_valido()
    service.devolver_equipos(
        prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[0].id]
    )

    with pytest.raises(ValueError, match="ya fue devuelto"):
        service.devolver_equipos(
            prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[0].id]
        )


def test_devolver_equipos_con_un_equipo_invalido_entre_varios_no_muta_nada():
    equipos = [_equipo("EQ-001"), _equipo("EQ-002")]
    prestamo, f, _ = _crear_prestamo_valido(equipos=equipos)
    otro_equipo = _equipo("EQ-OTRO")

    with pytest.raises(ValueError):
        service.devolver_equipos(
            prestamo.id,
            f["usuario_prestamista"].id,
            f["ubicacion"].id,
            [equipos[0].id, otro_equipo.id],
        )

    detalles = repository.listar_detalles_por_prestamo(prestamo.id)
    assert all(d.estado_equipo == EstadoDetalleEquipo.ENTREGADO for d in detalles)
    assert service.obtener_prestamo(prestamo.id).estado == EstadoPrestamo.ACTIVO
    assert service.listar_devoluciones_por_prestamo(prestamo.id) == []


# ------------------------------------------------------------------
# devolver_equipos — devolución parcial vs completa
# ------------------------------------------------------------------


def test_devolver_equipos_parcialmente_deja_el_prestamo_parcialmente_devuelto():
    equipos = [_equipo("EQ-001"), _equipo("EQ-002"), _equipo("EQ-003")]
    prestamo, f, _ = _crear_prestamo_valido(equipos=equipos)

    devolucion = service.devolver_equipos(
        prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[0].id, equipos[1].id]
    )

    assert devolucion.es_completa is False
    assert (
        service.obtener_prestamo(prestamo.id).estado
        == EstadoPrestamo.PARCIALMENTE_DEVUELTO
    )
    detalles = {d.equipo_id: d.estado_equipo for d in repository.listar_detalles_por_prestamo(prestamo.id)}
    assert detalles[equipos[0].id] == EstadoDetalleEquipo.DEVUELTO
    assert detalles[equipos[1].id] == EstadoDetalleEquipo.DEVUELTO
    assert detalles[equipos[2].id] == EstadoDetalleEquipo.ENTREGADO


def test_devolver_todos_los_equipos_deja_el_prestamo_completamente_devuelto():
    equipos = [_equipo("EQ-001"), _equipo("EQ-002")]
    prestamo, f, _ = _crear_prestamo_valido(equipos=equipos)

    devolucion = service.devolver_equipos(
        prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[0].id, equipos[1].id]
    )

    assert devolucion.es_completa is True
    assert (
        service.obtener_prestamo(prestamo.id).estado
        == EstadoPrestamo.COMPLETAMENTE_DEVUELTO
    )


def test_devolver_los_equipos_restantes_tras_una_parcial_completa_el_prestamo():
    equipos = [_equipo("EQ-001"), _equipo("EQ-002")]
    prestamo, f, _ = _crear_prestamo_valido(equipos=equipos)
    primera = service.devolver_equipos(
        prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[0].id]
    )

    segunda = service.devolver_equipos(
        prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[1].id]
    )

    assert primera.es_completa is False
    assert segunda.es_completa is True
    assert (
        service.obtener_prestamo(prestamo.id).estado
        == EstadoPrestamo.COMPLETAMENTE_DEVUELTO
    )
    assert len(service.listar_devoluciones_por_prestamo(prestamo.id)) == 2


def test_devolver_equipos_con_novedad_la_asocia_solo_al_equipo_correspondiente():
    equipos = [_equipo("EQ-001"), _equipo("EQ-002")]
    prestamo, f, _ = _crear_prestamo_valido(equipos=equipos)
    novedad = novedades_service.crear_novedad("dano", f["usuario_prestamista"].id)

    service.devolver_equipos(
        prestamo.id,
        f["usuario_prestamista"].id,
        f["ubicacion"].id,
        [equipos[0].id, equipos[1].id],
        novedades_por_equipo={equipos[0].id: novedad.id},
    )

    detalles = {d.equipo_id: d.novedad_id for d in repository.listar_detalles_por_prestamo(prestamo.id)}
    assert detalles[equipos[0].id] == novedad.id
    assert detalles[equipos[1].id] is None


def test_devolver_equipos_marca_fecha_devolucion():
    prestamo, f, equipos = _crear_prestamo_valido()

    service.devolver_equipos(
        prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[0].id]
    )

    detalle = repository.obtener_detalle_por_prestamo_y_equipo(prestamo.id, equipos[0].id)
    assert detalle.fecha_devolucion is not None


def test_listar_devoluciones_por_prestamo_delega_al_repository():
    prestamo, f, equipos = _crear_prestamo_valido()
    devolucion = service.devolver_equipos(
        prestamo.id, f["usuario_prestamista"].id, f["ubicacion"].id, [equipos[0].id]
    )

    resultado = service.listar_devoluciones_por_prestamo(prestamo.id)

    assert [d.id for d in resultado] == [devolucion.id]
