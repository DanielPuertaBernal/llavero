"""
Tests de llaves/service.py — la lógica que agrega valor sobre el
repository: validación de las 5 referencias cross-módulo de
`crear_llave`, de las referencias/permiso de `devolver_llave`, y las
reglas de negocio de domain.py (`ubicacion` debe permitir préstamo/
devolución de llaves). Los passthrough directos ya están cubiertos
transitivamente por test_repository.py.
"""

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from llaves import repository, service
from llaves.model import EstadoLlave, OrigenLlave, TipoEntregaLlave
from novedades import service as novedades_service
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _ubicacion(
    nombre="ubicacion-1",
    permite_prestamo_llaves=True,
    permite_devolucion_llaves=True,
):
    return catalogos_service.crear_ubicacion(
        nombre,
        permite_prestamo_llaves=permite_prestamo_llaves,
        permite_devolucion_llaves=permite_devolucion_llaves,
    )


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-usuario-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


def _fixtures(nombre_salon="101"):
    return {
        "salon": _salon(nombre_salon),
        "docente_titular": _persona("1000000001", "Docente Titular"),
        "reclamado_por": _persona("1000000002", "Reclamado Por"),
        "usuario_entrega": _usuario("entrega@uco.edu.co", "Portero"),
        "ubicacion_entrega": _ubicacion(f"ubicacion-entrega-{nombre_salon}"),
    }


def _crear_llave_valida(nombre_salon="101"):
    f = _fixtures(nombre_salon)
    return service.crear_llave(
        f["salon"].id,
        f["docente_titular"].id,
        f["reclamado_por"].id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        f["usuario_entrega"].id,
        f["ubicacion_entrega"].id,
    ), f


# ------------------------------------------------------------------
# crear_llave — validación de referencias
# ------------------------------------------------------------------


def test_crear_llave_con_salon_inexistente_da_value_error_claro():
    f = _fixtures()

    with pytest.raises(ValueError, match="salon"):
        service.crear_llave(
            "00000000-0000-0000-0000-000000000000",
            f["docente_titular"].id,
            f["reclamado_por"].id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            f["usuario_entrega"].id,
            f["ubicacion_entrega"].id,
        )


def test_crear_llave_con_docente_titular_inexistente_da_value_error_claro():
    f = _fixtures()

    with pytest.raises(ValueError, match="docente_titular"):
        service.crear_llave(
            f["salon"].id,
            "00000000-0000-0000-0000-000000000000",
            f["reclamado_por"].id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            f["usuario_entrega"].id,
            f["ubicacion_entrega"].id,
        )


def test_crear_llave_con_reclamado_por_inexistente_da_value_error_claro():
    f = _fixtures()

    with pytest.raises(ValueError, match="reclamado_por"):
        service.crear_llave(
            f["salon"].id,
            f["docente_titular"].id,
            "00000000-0000-0000-0000-000000000000",
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            f["usuario_entrega"].id,
            f["ubicacion_entrega"].id,
        )


def test_crear_llave_con_usuario_entrega_inexistente_da_value_error_claro():
    f = _fixtures()

    with pytest.raises(ValueError, match="usuario_entrega"):
        service.crear_llave(
            f["salon"].id,
            f["docente_titular"].id,
            f["reclamado_por"].id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            "00000000-0000-0000-0000-000000000000",
            f["ubicacion_entrega"].id,
        )


def test_crear_llave_con_ubicacion_entrega_inexistente_da_value_error_claro():
    f = _fixtures()

    with pytest.raises(ValueError, match="ubicacion_entrega"):
        service.crear_llave(
            f["salon"].id,
            f["docente_titular"].id,
            f["reclamado_por"].id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            f["usuario_entrega"].id,
            "00000000-0000-0000-0000-000000000000",
        )


def test_crear_llave_con_ubicacion_que_no_permite_prestamo_da_value_error_claro():
    f = _fixtures()
    ubicacion_sin_prestamo = _ubicacion(
        "ubicacion-sin-prestamo", permite_prestamo_llaves=False
    )

    with pytest.raises(ValueError, match="préstamo"):
        service.crear_llave(
            f["salon"].id,
            f["docente_titular"].id,
            f["reclamado_por"].id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            f["usuario_entrega"].id,
            ubicacion_sin_prestamo.id,
        )


def test_crear_llave_con_referencias_validas_delega_al_repository():
    llave, f = _crear_llave_valida()

    assert llave.salon_id == f["salon"].id
    assert llave.docente_titular_id == f["docente_titular"].id
    assert llave.reclamado_por_id == f["reclamado_por"].id


def test_crear_llave_nace_siempre_en_prestamo():
    llave, _ = _crear_llave_valida()

    assert llave.estado == EstadoLlave.EN_PRESTAMO


# ------------------------------------------------------------------
# obtener_llave / listar_llaves
# ------------------------------------------------------------------


def test_obtener_llave_inexistente_devuelve_none():
    assert service.obtener_llave("00000000-0000-0000-0000-000000000000") is None


def test_obtener_llave_existente_la_devuelve():
    creada, _ = _crear_llave_valida()

    assert service.obtener_llave(creada.id).id == creada.id


def test_listar_llaves_delega_al_repository():
    creada, _ = _crear_llave_valida()

    assert creada.id in {ll.id for ll in service.listar_llaves()}


# ------------------------------------------------------------------
# listar_llaves_por_estado / listar_llaves_por_docente_titular
# ------------------------------------------------------------------


def test_listar_llaves_por_estado_solo_devuelve_ese_estado():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    en_prestamo = service.crear_llave(
        _salon("101").id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )
    entregada = service.crear_llave(
        _salon("102").id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )
    service.devolver_llave(
        entregada.id,
        usuario_entrega.id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.CREDENCIAL,
    )

    resultado = service.listar_llaves_por_estado(EstadoLlave.EN_PRESTAMO)

    assert en_prestamo.id in {ll.id for ll in resultado}
    assert entregada.id not in {ll.id for ll in resultado}


def test_listar_llaves_por_docente_titular_solo_devuelve_las_de_ese_docente():
    docente_1 = _persona("1000000001", "Docente Uno")
    docente_2 = _persona("1000000002", "Docente Dos")
    reclamado_por = _persona("1000000003", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    de_docente_1 = service.crear_llave(
        _salon("101").id,
        docente_1.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )
    de_docente_2 = service.crear_llave(
        _salon("102").id,
        docente_2.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )

    resultado = service.listar_llaves_por_docente_titular(docente_1.id)

    assert {ll.id for ll in resultado} == {de_docente_1.id}
    assert de_docente_2.id not in {ll.id for ll in resultado}


# ------------------------------------------------------------------
# devolver_llave
# ------------------------------------------------------------------


def test_devolver_llave_transiciona_de_en_prestamo_a_entregado():
    creada, f = _crear_llave_valida()
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    assert creada.estado == EstadoLlave.EN_PRESTAMO

    devuelta = service.devolver_llave(
        creada.id,
        f["usuario_entrega"].id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.MANUAL,
    )

    assert devuelta.estado == EstadoLlave.ENTREGADO
    assert devuelta.tipo_devolucion == TipoEntregaLlave.MANUAL
    assert devuelta.fecha_hora_devolucion is not None


def test_devolver_llave_con_novedad_la_asocia():
    creada, f = _crear_llave_valida()
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    novedad = novedades_service.crear_novedad("dano", f["usuario_entrega"].id)

    devuelta = service.devolver_llave(
        creada.id,
        f["usuario_entrega"].id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.CREDENCIAL,
        novedad_id=novedad.id,
    )

    assert devuelta.novedad_id == novedad.id


def test_devolver_llave_con_usuario_recibe_inexistente_da_value_error_claro():
    creada, f = _crear_llave_valida()
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")

    with pytest.raises(ValueError, match="usuario_recibe"):
        service.devolver_llave(
            creada.id,
            "00000000-0000-0000-0000-000000000000",
            ubicacion_devolucion.id,
            TipoEntregaLlave.CREDENCIAL,
        )


def test_devolver_llave_con_ubicacion_devolucion_inexistente_da_value_error_claro():
    creada, f = _crear_llave_valida()

    with pytest.raises(ValueError, match="ubicacion_devolucion"):
        service.devolver_llave(
            creada.id,
            f["usuario_entrega"].id,
            "00000000-0000-0000-0000-000000000000",
            TipoEntregaLlave.CREDENCIAL,
        )


def test_devolver_llave_con_novedad_inexistente_da_value_error_claro():
    creada, f = _crear_llave_valida()
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")

    with pytest.raises(ValueError, match="novedad"):
        service.devolver_llave(
            creada.id,
            f["usuario_entrega"].id,
            ubicacion_devolucion.id,
            TipoEntregaLlave.CREDENCIAL,
            novedad_id="00000000-0000-0000-0000-000000000000",
        )


def test_devolver_llave_con_ubicacion_que_no_permite_devolucion_da_value_error_claro():
    creada, f = _crear_llave_valida()
    ubicacion_sin_devolucion = _ubicacion(
        "ubicacion-sin-devolucion", permite_devolucion_llaves=False
    )

    with pytest.raises(ValueError, match="devolución"):
        service.devolver_llave(
            creada.id,
            f["usuario_entrega"].id,
            ubicacion_sin_devolucion.id,
            TipoEntregaLlave.CREDENCIAL,
        )

    # No debe haber mutado el estado en la base de datos.
    assert repository.obtener_por_id(creada.id).estado == EstadoLlave.EN_PRESTAMO


def test_devolver_llave_inexistente_devuelve_none():
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    usuario = _usuario("usuario@uco.edu.co", "Usuario")

    assert (
        service.devolver_llave(
            "00000000-0000-0000-0000-000000000000",
            usuario.id,
            ubicacion_devolucion.id,
            TipoEntregaLlave.CREDENCIAL,
        )
        is None
    )
