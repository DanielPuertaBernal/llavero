"""
Tests de historial/service.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto (ver `disponibilidad/tests/test_service.py`, el otro
módulo sin tabla propia que combina fuentes ajenas).

Todos los fixtures cross-módulo (salón, personas, usuarios, ubicaciones,
equipos, llaves, préstamos) se crean vía la API pública de cada módulo
(`catalogos.service`, `comunidad.service`, `usuarios.service`,
`equipos.service`, `llaves.service`, `prestamos.service`), nunca vía sus
`repository`/`model` — la regla dura de módulos aplica también en tests.
"""

import uuid

import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from equipos import service as equipos_service
from historial import service
from llaves import service as llaves_service
from llaves.model import OrigenLlave, TipoEntregaLlave
from prestamos import service as prestamos_service
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _ubicacion(
    nombre="ubicacion-1",
    permite_prestamo_llaves=True,
    permite_devolucion_llaves=True,
    permite_prestamo_equipos=True,
):
    return catalogos_service.crear_ubicacion(
        nombre,
        permite_prestamo_llaves=permite_prestamo_llaves,
        permite_devolucion_llaves=permite_devolucion_llaves,
        permite_prestamo_equipos=permite_prestamo_equipos,
    )


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-usuario-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


def _equipo(codigo=None, nombre="Equipo Prueba"):
    codigo = codigo or f"EQ-{uuid.uuid4().hex[:8]}"
    return equipos_service.crear_equipo(nombre, codigo)


def _crear_llave(salon=None, docente_titular=None, reclamado_por=None,
                  usuario_entrega=None, ubicacion=None):
    salon = salon or _salon()
    docente_titular = docente_titular or _persona("1000000001", "Docente Titular")
    reclamado_por = reclamado_por or _persona("1000000002", "Reclamado Por")
    usuario_entrega = usuario_entrega or _usuario("portero1@uco.edu.co", "Portero 1")
    ubicacion = ubicacion or _ubicacion("ubicacion-llave-1")
    llave = llaves_service.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion.id,
    )
    return llave, {
        "salon": salon,
        "docente_titular": docente_titular,
        "reclamado_por": reclamado_por,
        "usuario_entrega": usuario_entrega,
        "ubicacion": ubicacion,
    }


def _crear_prestamo(solicitante=None, usuario_prestamista=None, ubicacion=None, equipos=None):
    solicitante = solicitante or _persona("1000000003", "Solicitante")
    usuario_prestamista = usuario_prestamista or _usuario(
        "portero2@uco.edu.co", "Portero 2"
    )
    ubicacion = ubicacion or _ubicacion("ubicacion-prestamo-1")
    equipos = equipos if equipos is not None else [_equipo()]
    prestamo = prestamos_service.crear_prestamo(
        solicitante.id,
        usuario_prestamista.id,
        ubicacion.id,
        [equipo.id for equipo in equipos],
    )
    return prestamo, {
        "solicitante": solicitante,
        "usuario_prestamista": usuario_prestamista,
        "ubicacion": ubicacion,
        "equipos": equipos,
    }


# ------------------------------------------------------------------
# listar_historial() sin filtro — sin datos
# ------------------------------------------------------------------


def test_listar_historial_sin_ninguna_llave_ni_prestamo_da_lista_vacia():
    assert service.listar_historial() == []


# ------------------------------------------------------------------
# listar_historial() — eventos de llaves
# ------------------------------------------------------------------


def test_listar_historial_incluye_evento_de_entrega_por_cada_llave_creada():
    llave, f = _crear_llave()

    eventos = service.listar_historial()

    assert len(eventos) == 1
    evento = eventos[0]
    assert evento["tipo_recurso"] == "llave"
    assert evento["tipo_evento"] == "entrega"
    assert evento["procesado_por_id"] == str(f["usuario_entrega"].id)
    assert evento["llave_id"] == str(llave.id)
    assert evento["salon_id"] == str(f["salon"].id)
    assert evento["docente_titular_id"] == str(f["docente_titular"].id)
    assert evento["reclamado_por_id"] == str(f["reclamado_por"].id)
    assert evento["fecha_hora"] == llave.fecha_hora_entrega.isoformat()
    # Campos exclusivos de "equipo" no aplican a un evento de llave.
    assert evento["prestamo_id"] is None
    assert evento["solicitante_id"] is None
    assert evento["equipo_ids"] is None


def test_listar_historial_no_incluye_evento_de_devolucion_si_la_llave_no_se_ha_devuelto():
    _crear_llave()

    eventos = service.listar_historial()

    assert [e["tipo_evento"] for e in eventos] == ["entrega"]


def test_listar_historial_incluye_evento_de_devolucion_tras_devolver_la_llave():
    llave, f = _crear_llave()
    usuario_recibe = _usuario("portero-recibe@uco.edu.co", "Portero Recibe")

    llave_devuelta = llaves_service.devolver_llave(
        llave.id,
        usuario_recibe.id,
        f["ubicacion"].id,
        TipoEntregaLlave.CREDENCIAL,
    )

    eventos = service.listar_historial()

    tipos = sorted(e["tipo_evento"] for e in eventos)
    assert tipos == ["devolucion", "entrega"]
    devolucion = next(e for e in eventos if e["tipo_evento"] == "devolucion")
    assert devolucion["tipo_recurso"] == "llave"
    assert devolucion["procesado_por_id"] == str(usuario_recibe.id)
    assert devolucion["llave_id"] == str(llave.id)
    assert devolucion["fecha_hora"] == llave_devuelta.fecha_hora_devolucion.isoformat()


# ------------------------------------------------------------------
# listar_historial() — eventos de préstamos de equipos
# ------------------------------------------------------------------


def test_listar_historial_incluye_evento_de_entrega_por_cada_prestamo_creado():
    equipo = _equipo()
    prestamo, f = _crear_prestamo(equipos=[equipo])

    eventos = service.listar_historial()

    assert len(eventos) == 1
    evento = eventos[0]
    assert evento["tipo_recurso"] == "equipo"
    assert evento["tipo_evento"] == "entrega"
    assert evento["procesado_por_id"] == str(f["usuario_prestamista"].id)
    assert evento["prestamo_id"] == str(prestamo.id)
    assert evento["solicitante_id"] == str(f["solicitante"].id)
    assert evento["equipo_ids"] == [str(equipo.id)]
    assert evento["fecha_hora"] == prestamo.fecha_creacion.isoformat()
    # Campos exclusivos de "llave" no aplican a un evento de equipo.
    assert evento["llave_id"] is None
    assert evento["salon_id"] is None
    assert evento["docente_titular_id"] is None
    assert evento["reclamado_por_id"] is None


def test_listar_historial_no_incluye_evento_de_devolucion_si_no_se_ha_devuelto_nada():
    _crear_prestamo()

    eventos = service.listar_historial()

    assert [e["tipo_evento"] for e in eventos] == ["entrega"]


def test_listar_historial_incluye_evento_de_devolucion_tras_devolver_equipos():
    equipo = _equipo()
    prestamo, f = _crear_prestamo(equipos=[equipo])
    usuario_recibe = _usuario("portero-req@uco.edu.co", "Portero Recibe Equipo")

    prestamos_service.devolver_equipos(
        prestamo.id, usuario_recibe.id, f["ubicacion"].id, [equipo.id]
    )

    eventos = service.listar_historial()

    tipos = sorted(e["tipo_evento"] for e in eventos)
    assert tipos == ["devolucion", "entrega"]
    devolucion = next(e for e in eventos if e["tipo_evento"] == "devolucion")
    assert devolucion["tipo_recurso"] == "equipo"
    assert devolucion["procesado_por_id"] == str(usuario_recibe.id)
    assert devolucion["prestamo_id"] == str(prestamo.id)


def test_listar_historial_con_devolucion_parcial_genera_un_solo_evento_de_devolucion():
    equipo_a = _equipo()
    equipo_b = _equipo()
    prestamo, f = _crear_prestamo(equipos=[equipo_a, equipo_b])
    usuario_recibe = _usuario("portero-parcial@uco.edu.co", "Portero Parcial")

    prestamos_service.devolver_equipos(
        prestamo.id, usuario_recibe.id, f["ubicacion"].id, [equipo_a.id]
    )

    eventos = service.listar_historial()

    devoluciones = [e for e in eventos if e["tipo_evento"] == "devolucion"]
    assert len(devoluciones) == 1
    assert devoluciones[0]["prestamo_id"] == str(prestamo.id)


# ------------------------------------------------------------------
# listar_historial() — combinación, orden y filtro por usuario_id (RF28)
# ------------------------------------------------------------------


def test_listar_historial_combina_llaves_y_prestamos_en_una_sola_lista():
    _crear_llave()
    _crear_prestamo()

    eventos = service.listar_historial()

    recursos = sorted(e["tipo_recurso"] for e in eventos)
    assert recursos == ["equipo", "llave"]


def test_listar_historial_ordena_por_fecha_mas_reciente_primero():
    _crear_llave()
    _crear_prestamo()

    eventos = service.listar_historial()

    fechas = [e["fecha_hora"] for e in eventos]
    assert fechas == sorted(fechas, reverse=True)


def test_listar_historial_con_usuario_id_filtra_solo_lo_procesado_por_ese_usuario():
    _llave_ana, f_ana = _crear_llave(usuario_entrega=_usuario("ana@uco.edu.co", "Ana"))
    _prestamo_luis, f_luis = _crear_prestamo(
        usuario_prestamista=_usuario("luis@uco.edu.co", "Luis")
    )

    eventos_de_ana = service.listar_historial(usuario_id=f_ana["usuario_entrega"].id)

    assert len(eventos_de_ana) == 1
    assert eventos_de_ana[0]["procesado_por_id"] == str(f_ana["usuario_entrega"].id)


def test_listar_historial_con_usuario_id_sin_coincidencias_da_lista_vacia():
    _crear_llave()
    usuario_ajeno = _usuario("nadie@uco.edu.co", "Nadie")

    assert service.listar_historial(usuario_id=usuario_ajeno.id) == []


def test_listar_historial_con_usuario_id_incluye_devolucion_procesada_por_otro_usuario():
    # Un portero A entrega la llave, un portero B la recibe de vuelta:
    # RF28 exige que cada uno vea SOLO lo que ÉL procesó, así que el
    # evento de devolución debe aparecer al filtrar por B aunque la
    # entrega la haya hecho A.
    llave, f = _crear_llave(usuario_entrega=_usuario("porteroA@uco.edu.co", "Portero A"))
    portero_b = _usuario("porteroB@uco.edu.co", "Portero B")
    llaves_service.devolver_llave(
        llave.id, portero_b.id, f["ubicacion"].id, TipoEntregaLlave.CREDENCIAL
    )

    eventos_de_b = service.listar_historial(usuario_id=portero_b.id)

    assert len(eventos_de_b) == 1
    assert eventos_de_b[0]["tipo_evento"] == "devolucion"
    assert eventos_de_b[0]["procesado_por_id"] == str(portero_b.id)
