"""
Tests de llaves/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

Los fixtures cross-módulo (salon, personas de comunidad, usuarios,
ubicaciones, novedad) se crean vía la API pública de cada módulo
(`catalogos.service`, `comunidad.service`, `usuarios.service`,
`novedades.service`), nunca vía sus `repository`/`model` — la regla
dura de módulos aplica también en tests (ver
programacion/tests/test_repository.py).
"""

import datetime

import pytest
from django.db import IntegrityError, connection
from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from llaves import repository
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


def _novedad(usuario):
    return novedades_service.crear_novedad("dano", usuario.id)


def _llave(
    salon=None,
    docente_titular=None,
    reclamado_por=None,
    usuario_entrega=None,
    ubicacion_entrega=None,
):
    salon = salon or _salon()
    docente_titular = docente_titular or _persona("1000000001", "Docente Titular")
    reclamado_por = reclamado_por or _persona("1000000002", "Reclamado Por")
    usuario_entrega = usuario_entrega or _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = ubicacion_entrega or _ubicacion("ubicacion-entrega")
    return repository.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )


# ------------------------------------------------------------------
# crear_llave
# ------------------------------------------------------------------


def test_crear_llave_la_persiste_con_sus_valores_y_defaults():
    salon = _salon()
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")

    llave = repository.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )

    assert llave.id is not None
    assert llave.salon_id == salon.id
    assert llave.docente_titular_id == docente_titular.id
    assert llave.reclamado_por_id == reclamado_por.id
    assert llave.origen == OrigenLlave.MANUAL
    assert llave.tipo_entrega == TipoEntregaLlave.CREDENCIAL
    assert llave.usuario_entrega_id == usuario_entrega.id
    assert llave.ubicacion_entrega_id == ubicacion_entrega.id
    # Valores por defecto del DDL (ver model.py).
    assert llave.estado == EstadoLlave.EN_PRESTAMO
    assert llave.fecha_hora_entrega is not None
    assert llave.fecha_hora_devolucion is None
    assert llave.tipo_devolucion is None
    assert llave.usuario_recibe_id is None
    assert llave.ubicacion_devolucion_id is None
    assert llave.novedad_id is None


def test_crear_llave_con_origen_invalido_falla_por_check_constraint():
    salon = _salon()
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")

    with pytest.raises(IntegrityError):
        repository.crear_llave(
            salon.id,
            docente_titular.id,
            reclamado_por.id,
            "invalido",
            TipoEntregaLlave.CREDENCIAL,
            usuario_entrega.id,
            ubicacion_entrega.id,
        )


def test_crear_llave_con_tipo_entrega_invalido_falla_por_check_constraint():
    salon = _salon()
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")

    with pytest.raises(IntegrityError):
        repository.crear_llave(
            salon.id,
            docente_titular.id,
            reclamado_por.id,
            OrigenLlave.MANUAL,
            "invalido",
            usuario_entrega.id,
            ubicacion_entrega.id,
        )


def test_crear_llave_con_salon_inexistente_falla_por_fk():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")

    with pytest.raises(IntegrityError):
        repository.crear_llave(
            "00000000-0000-0000-0000-000000000000",
            docente_titular.id,
            reclamado_por.id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            usuario_entrega.id,
            ubicacion_entrega.id,
        )
        connection.check_constraints()


def test_crear_llave_con_docente_titular_inexistente_falla_por_fk():
    salon = _salon()
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")

    with pytest.raises(IntegrityError):
        repository.crear_llave(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            reclamado_por.id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            usuario_entrega.id,
            ubicacion_entrega.id,
        )
        connection.check_constraints()


def test_crear_llave_con_usuario_entrega_inexistente_falla_por_fk():
    salon = _salon()
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")

    with pytest.raises(IntegrityError):
        repository.crear_llave(
            salon.id,
            docente_titular.id,
            reclamado_por.id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            "00000000-0000-0000-0000-000000000000",
            ubicacion_entrega.id,
        )
        connection.check_constraints()


def test_crear_llave_con_ubicacion_entrega_inexistente_falla_por_fk():
    salon = _salon()
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")

    with pytest.raises(IntegrityError):
        repository.crear_llave(
            salon.id,
            docente_titular.id,
            reclamado_por.id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            usuario_entrega.id,
            "00000000-0000-0000-0000-000000000000",
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# idx_llave_activa_unica_por_salon (RNF02)
# ------------------------------------------------------------------


def test_dos_llaves_activas_del_mismo_salon_falla_por_unicidad():
    salon = _salon()
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    repository.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )

    with pytest.raises(IntegrityError):
        repository.crear_llave(
            salon.id,
            docente_titular.id,
            reclamado_por.id,
            OrigenLlave.MANUAL,
            TipoEntregaLlave.CREDENCIAL,
            usuario_entrega.id,
            ubicacion_entrega.id,
        )


def test_nueva_llave_del_mismo_salon_tras_devolver_la_anterior_no_falla():
    salon = _salon()
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    primera = repository.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )
    repository.devolver_llave(
        primera.id,
        usuario_entrega.id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.CREDENCIAL,
        timezone.now(),
    )

    segunda = repository.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )

    assert segunda.id is not None
    assert segunda.salon_id == salon.id


# ------------------------------------------------------------------
# obtener_por_id / listar_llaves
# ------------------------------------------------------------------


def test_obtener_por_id_inexistente_devuelve_none():
    assert repository.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_id_existente_lo_devuelve():
    creada = _llave()

    assert repository.obtener_por_id(creada.id).id == creada.id


def test_listar_llaves():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    _llave(
        salon=_salon("101"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )
    _llave(
        salon=_salon("102"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )

    assert len(repository.listar_llaves()) >= 2


# ------------------------------------------------------------------
# listar_por_estado / listar_por_docente_titular
# ------------------------------------------------------------------


def test_listar_por_estado():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    en_prestamo = _llave(
        salon=_salon("101"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )
    entregada = _llave(
        salon=_salon("102"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )
    repository.devolver_llave(
        entregada.id,
        usuario_entrega.id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.CREDENCIAL,
        timezone.now(),
    )

    resultado = repository.listar_por_estado(EstadoLlave.EN_PRESTAMO)

    assert {ll.id for ll in resultado} >= {en_prestamo.id}
    assert entregada.id not in {ll.id for ll in resultado}


def test_listar_por_docente_titular():
    docente_1 = _persona("1000000001", "Docente Uno")
    docente_2 = _persona("1000000002", "Docente Dos")
    reclamado_por = _persona("1000000003", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    de_docente_1 = _llave(
        salon=_salon("101"),
        docente_titular=docente_1,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )
    de_docente_2 = _llave(
        salon=_salon("102"),
        docente_titular=docente_2,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )

    resultado = repository.listar_por_docente_titular(docente_1.id)

    assert {ll.id for ll in resultado} == {de_docente_1.id}
    assert de_docente_2.id not in {ll.id for ll in resultado}


# ------------------------------------------------------------------
# listar_activas_por_reclamado_por
# ------------------------------------------------------------------


def test_listar_activas_por_reclamado_por_excluye_entregadas():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    activa = _llave(
        salon=_salon("101"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )
    entregada = _llave(
        salon=_salon("102"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_por,
        usuario_entrega=usuario_entrega,
    )
    repository.devolver_llave(
        entregada.id,
        usuario_entrega.id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.CREDENCIAL,
        timezone.now(),
    )

    resultado = repository.listar_activas_por_reclamado_por(reclamado_por.id)

    assert {ll.id for ll in resultado} == {activa.id}
    assert entregada.id not in {ll.id for ll in resultado}


def test_listar_activas_por_reclamado_por_solo_devuelve_las_de_esa_persona():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_1 = _persona("1000000002", "Reclamado Uno")
    reclamado_2 = _persona("1000000003", "Reclamado Dos")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    de_reclamado_1 = _llave(
        salon=_salon("101"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_1,
        usuario_entrega=usuario_entrega,
    )
    _llave(
        salon=_salon("102"),
        docente_titular=docente_titular,
        reclamado_por=reclamado_2,
        usuario_entrega=usuario_entrega,
    )

    resultado = repository.listar_activas_por_reclamado_por(reclamado_1.id)

    assert {ll.id for ll in resultado} == {de_reclamado_1.id}


def test_listar_activas_por_reclamado_por_sin_llaves_devuelve_lista_vacia():
    reclamado_por = _persona()

    assert repository.listar_activas_por_reclamado_por(reclamado_por.id) == []


# ------------------------------------------------------------------
# devolver_llave
# ------------------------------------------------------------------


def test_devolver_llave_pone_estado_entregado_y_guarda_los_datos_de_devolucion():
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    usuario_recibe = _usuario("recibe@uco.edu.co", "Otro Portero")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    novedad = _novedad(usuario_recibe)
    creada = _llave(usuario_entrega=usuario_entrega)
    ahora = timezone.now()

    devuelta = repository.devolver_llave(
        creada.id,
        usuario_recibe.id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.MANUAL,
        ahora,
        novedad_id=novedad.id,
    )

    assert devuelta.estado == EstadoLlave.ENTREGADO
    assert devuelta.fecha_hora_devolucion == ahora
    assert devuelta.usuario_recibe_id == usuario_recibe.id
    assert devuelta.ubicacion_devolucion_id == ubicacion_devolucion.id
    assert devuelta.tipo_devolucion == TipoEntregaLlave.MANUAL
    assert devuelta.novedad_id == novedad.id
    persistida = repository.obtener_por_id(creada.id)
    assert persistida.estado == EstadoLlave.ENTREGADO
    assert persistida.fecha_hora_devolucion == ahora


def test_devolver_llave_sin_novedad_lo_permite():
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    creada = _llave(usuario_entrega=usuario_entrega)

    devuelta = repository.devolver_llave(
        creada.id,
        usuario_entrega.id,
        ubicacion_devolucion.id,
        TipoEntregaLlave.CREDENCIAL,
        timezone.now(),
    )

    assert devuelta.novedad_id is None


def test_devolver_llave_inexistente_devuelve_none():
    assert (
        repository.devolver_llave(
            "00000000-0000-0000-0000-000000000000",
            "00000000-0000-0000-0000-000000000000",
            "00000000-0000-0000-0000-000000000000",
            TipoEntregaLlave.CREDENCIAL,
            timezone.now(),
        )
        is None
    )


# ------------------------------------------------------------------
# marcar_demora
# ------------------------------------------------------------------


def test_marcar_demora_actualiza_solo_el_campo_estado():
    creada = _llave()

    actualizada = repository.marcar_demora(creada.id)

    assert actualizada.estado == EstadoLlave.DEMORA_ENTREGA
    persistida = repository.obtener_por_id(creada.id)
    assert persistida.estado == EstadoLlave.DEMORA_ENTREGA
    # No debe tocar ningún otro campo (single-field UPDATE, ver docstring).
    assert persistida.fecha_hora_devolucion is None
    assert persistida.usuario_recibe_id is None


def test_marcar_demora_inexistente_devuelve_none():
    assert (
        repository.marcar_demora("00000000-0000-0000-0000-000000000000") is None
    )


def test_devolver_llave_con_fecha_anterior_a_la_entrega_falla_por_check_constraint():
    # CHECK (fecha_hora_devolucion IS NULL OR fecha_hora_devolucion >
    # fecha_hora_entrega) del DDL: se fuerza pasando una fecha anterior a
    # la de entrega — repository.devolver_llave recibe la fecha ya
    # calculada desde afuera (ver docstring del módulo), lo que permite
    # este test sin mockear el reloj.
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    creada = _llave(usuario_entrega=usuario_entrega)
    fecha_anterior = creada.fecha_hora_entrega - datetime.timedelta(days=1)

    with pytest.raises(IntegrityError):
        repository.devolver_llave(
            creada.id,
            usuario_entrega.id,
            ubicacion_devolucion.id,
            TipoEntregaLlave.CREDENCIAL,
            fecha_anterior,
        )
