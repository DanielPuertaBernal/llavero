"""
Tests de nfc/service.py contra una base de datos de test real (Postgres,
vía pytest-django) — sin mocks, tal como pide la convención TDD del
proyecto.

Todos los fixtures cross-módulo (salon, personas de comunidad, usuarios,
ubicaciones, semestre, programación, reserva semestral, monitor) se crean
vía la API pública de cada módulo (`catalogos.service`,
`comunidad.service`, `usuarios.service`, `programacion.service`,
`reservas_semestrales.service`, `monitores.service`), nunca vía sus
`repository`/`model` — la regla dura de módulos aplica también en tests
(ver `llaves/tests/test_service.py`).

`ahora` se fija siempre explícito (nunca se deja el default
`timezone.now()`) para que los tests sean determinísticos: 2026-03-09 es
lunes (ver `nfc/tests/test_domain.py`), a las 9:00 hora de Bogotá
(`TIME_ZONE = "America/Bogota"`), dentro de la franja 8:00-10:00 que usan
la mayoría de fixtures de este archivo.
"""

import datetime

import pytest
from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from llaves import service as llaves_service
from llaves.model import EstadoLlave, OrigenLlave, TipoEntregaLlave
from monitores import service as monitores_service
from nfc import service
from programacion import service as programacion_service
from programacion.model import DiaSemana
from reservas_semestrales import service as reservas_semestrales_service
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


LUNES_9AM = timezone.make_aware(datetime.datetime(2026, 3, 9, 9, 0))


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _persona(numero_documento="1000000001", nombre="Persona Prueba", id_carnet=None):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(
        numero_documento,
        nombre,
        tipo_persona.id,
        id_carnet=id_carnet or f"c-{numero_documento}",
    )


def _ubicacion(nombre="ubicacion-1"):
    return catalogos_service.crear_ubicacion(nombre)


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-usuario-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


def _semestre(codigo="2026-1"):
    return programacion_service.crear_semestre(
        codigo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )


def _programacion(salon, docente, semestre, dia=DiaSemana.LUNES, materia="Cálculo I"):
    return programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, dia,
        datetime.time(8, 0), datetime.time(10, 0), materia,
    )


def _reserva_semestral(salon, solicitante, semestre, dia=DiaSemana.LUNES):
    return reservas_semestrales_service.crear_reserva_semestral(
        salon.id, solicitante.id, semestre.id, dia,
        datetime.time(8, 0), datetime.time(10, 0),
    )


def _llave_activa(salon, docente_titular, reclamado_por, usuario_entrega, ubicacion_entrega):
    return llaves_service.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )


# ------------------------------------------------------------------
# resolver_credencial — no_reconocida
# ------------------------------------------------------------------


def test_resolver_credencial_carnet_inexistente_da_no_reconocida():
    resultado = service.resolver_credencial("c-inexistente", ahora=LUNES_9AM)

    assert resultado == {"accion": "no_reconocida"}


# ------------------------------------------------------------------
# resolver_credencial — devolucion
# ------------------------------------------------------------------


def test_resolver_credencial_con_llave_activa_reclamada_da_devolucion():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por", id_carnet="c-reclamado")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    llave = _llave_activa(_salon("101"), docente_titular, reclamado_por, usuario_entrega, ubicacion_entrega)

    resultado = service.resolver_credencial("c-reclamado", ahora=LUNES_9AM)

    assert resultado == {"accion": "devolucion", "llave_id": str(llave.id)}


def test_resolver_credencial_con_dos_llaves_activas_da_ambigua():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por", id_carnet="c-reclamado")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    llave_1 = _llave_activa(_salon("101"), docente_titular, reclamado_por, usuario_entrega, ubicacion_entrega)
    llave_2 = _llave_activa(_salon("102"), docente_titular, reclamado_por, usuario_entrega, ubicacion_entrega)

    resultado = service.resolver_credencial("c-reclamado", ahora=LUNES_9AM)

    assert resultado["accion"] == "ambigua"
    ids = {c["llave_id"] for c in resultado["candidatos"]}
    assert ids == {str(llave_1.id), str(llave_2.id)}
    assert all(c["tipo"] == "devolucion" for c in resultado["candidatos"])


# ------------------------------------------------------------------
# resolver_credencial — entrega propia (programacion / reserva_semestral)
# ------------------------------------------------------------------


def test_resolver_credencial_con_programacion_propia_ahora_da_entrega():
    salon = _salon("101")
    semestre = _semestre()
    docente = _persona("1000000001", "Docente Prueba", id_carnet="c-docente")
    _programacion(salon, docente, semestre)

    resultado = service.resolver_credencial("c-docente", ahora=LUNES_9AM)

    assert resultado == {
        "accion": "entrega",
        "origen": OrigenLlave.PROGRAMACION,
        "salon_id": str(salon.id),
        "docente_titular_id": str(docente.id),
        "reclamado_por_id": str(docente.id),
    }


def test_resolver_credencial_con_reserva_semestral_propia_ahora_da_entrega():
    salon = _salon("101")
    semestre = _semestre()
    solicitante = _persona("1000000001", "Solicitante Prueba", id_carnet="c-solicitante")
    _reserva_semestral(salon, solicitante, semestre)

    resultado = service.resolver_credencial("c-solicitante", ahora=LUNES_9AM)

    assert resultado == {
        "accion": "entrega",
        "origen": OrigenLlave.RESERVA_SEMESTRAL,
        "salon_id": str(salon.id),
        "docente_titular_id": str(solicitante.id),
        "reclamado_por_id": str(solicitante.id),
    }


def test_resolver_credencial_fuera_de_horario_da_sin_coincidencia():
    salon = _salon("101")
    semestre = _semestre()
    docente = _persona("1000000001", "Docente Prueba", id_carnet="c-docente")
    _programacion(salon, docente, semestre)
    fuera_de_horario = timezone.make_aware(datetime.datetime(2026, 3, 9, 14, 0))

    resultado = service.resolver_credencial("c-docente", ahora=fuera_de_horario)

    assert resultado == {"accion": "sin_coincidencia"}


def test_resolver_credencial_con_dos_candidatos_de_entrega_da_ambigua():
    # Mismo docente/solicitante con una Programacion Y una ReservaSemestral
    # vigentes al mismo tiempo en salones distintos: caso "poco probable
    # pero posible" que la Nota de diseño del módulo documenta.
    semestre = _semestre()
    persona = _persona("1000000001", "Persona Prueba", id_carnet="c-persona")
    _programacion(_salon("101"), persona, semestre)
    _reserva_semestral(_salon("102"), persona, semestre)

    resultado = service.resolver_credencial("c-persona", ahora=LUNES_9AM)

    assert resultado["accion"] == "ambigua"
    assert len(resultado["candidatos"]) == 2
    assert all(c["tipo"] == "entrega" for c in resultado["candidatos"])


# ------------------------------------------------------------------
# resolver_credencial — entrega por delegación de Monitor
# ------------------------------------------------------------------


def test_resolver_credencial_monitor_delegado_de_clase_vigente_da_entrega():
    salon = _salon("101")
    semestre = _semestre()
    docente_titular = _persona("1000000001", "Docente Titular")
    monitor = _persona("1000000002", "Monitor Prueba", id_carnet="c-monitor")
    _programacion(salon, docente_titular, semestre, materia="Cálculo I")
    monitores_service.crear_monitor(docente_titular.id, monitor.id, "Cálculo I")

    resultado = service.resolver_credencial("c-monitor", ahora=LUNES_9AM)

    assert resultado == {
        "accion": "entrega",
        "origen": OrigenLlave.PROGRAMACION,
        "salon_id": str(salon.id),
        "docente_titular_id": str(docente_titular.id),
        "reclamado_por_id": str(monitor.id),
    }


def test_resolver_credencial_monitor_con_aula_distinta_no_da_entrega():
    salon = _salon("101")
    semestre = _semestre()
    docente_titular = _persona("1000000001", "Docente Titular")
    monitor = _persona("1000000002", "Monitor Prueba", id_carnet="c-monitor")
    _programacion(salon, docente_titular, semestre, materia="Cálculo I")
    monitores_service.crear_monitor(
        docente_titular.id, monitor.id, "Cálculo I", aula="Aula que no existe"
    )

    resultado = service.resolver_credencial("c-monitor", ahora=LUNES_9AM)

    assert resultado == {"accion": "sin_coincidencia"}


def test_resolver_credencial_monitoria_desactivada_no_da_entrega():
    salon = _salon("101")
    semestre = _semestre()
    docente_titular = _persona("1000000001", "Docente Titular")
    monitor = _persona("1000000002", "Monitor Prueba", id_carnet="c-monitor")
    _programacion(salon, docente_titular, semestre, materia="Cálculo I")
    monitoria = monitores_service.crear_monitor(docente_titular.id, monitor.id, "Cálculo I")
    monitores_service.desactivar_monitor(monitoria.id)

    resultado = service.resolver_credencial("c-monitor", ahora=LUNES_9AM)

    assert resultado == {"accion": "sin_coincidencia"}


def test_resolver_credencial_no_cruza_monitor_contra_reserva_semestral():
    # Nota de diseño del módulo: ReservaSemestral no tiene columna
    # `materia` en el DDL, así que una monitoría NUNCA debe poder generar
    # una entrega cruzando contra una reserva semestral, aunque el
    # "solicitante" de esa reserva sea el mismo docente_titular de la
    # monitoría y el horario coincida.
    salon = _salon("101")
    semestre = _semestre()
    docente_titular = _persona("1000000001", "Docente Titular")
    monitor = _persona("1000000002", "Monitor Prueba", id_carnet="c-monitor")
    _reserva_semestral(salon, docente_titular, semestre)
    monitores_service.crear_monitor(docente_titular.id, monitor.id, "Cálculo I")

    resultado = service.resolver_credencial("c-monitor", ahora=LUNES_9AM)

    assert resultado == {"accion": "sin_coincidencia"}


# ------------------------------------------------------------------
# resolver_credencial — desempate devolucion > entrega
# ------------------------------------------------------------------


def test_resolver_credencial_con_llave_activa_y_clase_a_la_vez_prioriza_devolucion():
    salon_clase = _salon("101")
    salon_llave = _salon("102")
    semestre = _semestre()
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    docente = _persona("1000000001", "Docente Prueba", id_carnet="c-docente")
    _programacion(salon_clase, docente, semestre)
    llave = _llave_activa(salon_llave, docente, docente, usuario_entrega, ubicacion_entrega)

    resultado = service.resolver_credencial("c-docente", ahora=LUNES_9AM)

    assert resultado == {"accion": "devolucion", "llave_id": str(llave.id)}


# ------------------------------------------------------------------
# procesar_credencial — validación de usuario_id / ubicacion_id
# ------------------------------------------------------------------


def test_procesar_credencial_con_usuario_inexistente_da_value_error_claro():
    ubicacion = _ubicacion("ubicacion-1")

    with pytest.raises(ValueError, match="usuario"):
        service.procesar_credencial(
            "c-cualquiera",
            "00000000-0000-0000-0000-000000000000",
            ubicacion.id,
            ahora=LUNES_9AM,
        )


def test_procesar_credencial_con_ubicacion_inexistente_da_value_error_claro():
    usuario = _usuario("entrega@uco.edu.co", "Portero")

    with pytest.raises(ValueError, match="ubicacion"):
        service.procesar_credencial(
            "c-cualquiera",
            usuario.id,
            "00000000-0000-0000-0000-000000000000",
            ahora=LUNES_9AM,
        )


# ------------------------------------------------------------------
# procesar_credencial — ejecuta la operación real
# ------------------------------------------------------------------


def test_procesar_credencial_con_resolucion_entrega_crea_la_llave_real():
    salon = _salon("101")
    semestre = _semestre()
    docente = _persona("1000000001", "Docente Prueba", id_carnet="c-docente")
    usuario = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion = _ubicacion("ubicacion-entrega")
    _programacion(salon, docente, semestre)

    resultado = service.procesar_credencial(
        "c-docente", usuario.id, ubicacion.id, ahora=LUNES_9AM
    )

    assert resultado["accion"] == "entrega"
    llave_persistida = llaves_service.obtener_llave(resultado["llave_id"])
    assert llave_persistida is not None
    assert llave_persistida.estado == EstadoLlave.EN_PRESTAMO
    assert llave_persistida.salon_id == salon.id
    assert llave_persistida.docente_titular_id == docente.id
    assert llave_persistida.reclamado_por_id == docente.id
    assert llave_persistida.tipo_entrega == TipoEntregaLlave.CREDENCIAL
    assert llave_persistida.origen == OrigenLlave.PROGRAMACION


def test_procesar_credencial_con_resolucion_devolucion_devuelve_la_llave_real():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por", id_carnet="c-reclamado")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    ubicacion_devolucion = _ubicacion("ubicacion-devolucion")
    llave = _llave_activa(_salon("101"), docente_titular, reclamado_por, usuario_entrega, ubicacion_entrega)

    resultado = service.procesar_credencial(
        "c-reclamado", usuario_entrega.id, ubicacion_devolucion.id, ahora=LUNES_9AM
    )

    assert resultado["accion"] == "devolucion"
    assert resultado["llave_id"] == str(llave.id)
    llave_persistida = llaves_service.obtener_llave(llave.id)
    assert llave_persistida.estado == EstadoLlave.ENTREGADO
    assert llave_persistida.fecha_hora_devolucion is not None


# ------------------------------------------------------------------
# procesar_credencial — no ejecuta nada si la resolución no es directa
# ------------------------------------------------------------------


def test_procesar_credencial_con_resolucion_ambigua_no_ejecuta_nada():
    docente_titular = _persona("1000000001", "Docente Titular")
    reclamado_por = _persona("1000000002", "Reclamado Por", id_carnet="c-reclamado")
    usuario_entrega = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion_entrega = _ubicacion("ubicacion-entrega")
    _llave_activa(_salon("101"), docente_titular, reclamado_por, usuario_entrega, ubicacion_entrega)
    _llave_activa(_salon("102"), docente_titular, reclamado_por, usuario_entrega, ubicacion_entrega)
    llaves_antes = {ll.id for ll in llaves_service.listar_llaves()}

    resultado = service.procesar_credencial(
        "c-reclamado", usuario_entrega.id, ubicacion_entrega.id, ahora=LUNES_9AM
    )

    assert resultado["accion"] == "ambigua"
    llaves_despues = {ll.id for ll in llaves_service.listar_llaves()}
    assert llaves_antes == llaves_despues
    assert all(
        ll.estado != EstadoLlave.ENTREGADO for ll in llaves_service.listar_llaves()
        if ll.id in llaves_antes
    )


def test_procesar_credencial_con_resolucion_sin_coincidencia_no_ejecuta_nada():
    persona = _persona("1000000001", "Persona Sin Nada", id_carnet="c-persona")
    usuario = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion = _ubicacion("ubicacion-1")
    llaves_antes = len(llaves_service.listar_llaves())

    resultado = service.procesar_credencial(
        "c-persona", usuario.id, ubicacion.id, ahora=LUNES_9AM
    )

    assert resultado == {"accion": "sin_coincidencia"}
    assert len(llaves_service.listar_llaves()) == llaves_antes


def test_procesar_credencial_con_resolucion_no_reconocida_no_ejecuta_nada():
    usuario = _usuario("entrega@uco.edu.co", "Portero")
    ubicacion = _ubicacion("ubicacion-1")
    llaves_antes = len(llaves_service.listar_llaves())

    resultado = service.procesar_credencial(
        "c-inexistente", usuario.id, ubicacion.id, ahora=LUNES_9AM
    )

    assert resultado == {"accion": "no_reconocida"}
    assert len(llaves_service.listar_llaves()) == llaves_antes
