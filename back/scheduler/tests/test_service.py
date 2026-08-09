"""
Tests de scheduler/service.py — orquestación completa de
`ejecutar_transiciones` (ver sdd/scheduler-transiciones/design):

- Camino feliz llaves: `en_prestamo` en mora -> `demora_entrega` + primer
  recordatorio en la MISMA corrida.
- Camino feliz reservas: `aprobada` sin reclamar -> `no_reclamada` +
  vencimiento (envío único, sin tope).
- Idempotencia: invocar dos veces seguidas con el mismo `ahora` no debe
  mutar ni notificar de más (se fija `max_reintentos_recordatorio=1` para
  que el tope ya esté agotado tras el primer envío, ver docstring del
  test — una reserva ya transicionada queda fuera de
  `listar_reservas_aprobadas_hasta` por construcción, así que su
  idempotencia es automática).
- Tope de reintentos: no se envía un recordatorio más allá de
  `max_reintentos_recordatorio`, y eso NO cuenta como error.
- Aislamiento por ítem: un `ValueError` de una fila no debe abortar el
  resto del lote (se fuerza con un único mock justificado sobre
  `llaves_service.marcar_demora`, simulando el mismo escenario que el
  diseño documenta como riesgo real — "una fila mala", ver Risks del
  diseño).
- Estados no elegibles quedan intactos (llave que aún no está en mora,
  reserva ya `completada`).

`fecha_hora_entrega` de `Llave` es `auto_now_add=True` (no se puede fijar
al crear, ver design decisión 2b) — por eso `ahora` siempre se calcula
sumando minutos sobre `llave.fecha_hora_entrega` real, nunca sobre una
fecha fija. `fecha`/`hora_inicio` de `ReservaIndividual` sí son
explícitos, así que esos tests usan una fecha fija en el pasado.
"""

import datetime
import unittest.mock

import pytest
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from configuracion import service as configuracion_service
from llaves import service as llaves_service
from llaves.model import EstadoLlave, OrigenLlave, TipoEntregaLlave
from notificaciones import service as notificaciones_service
from reservas import service as reservas_service
from reservas.model import EstadoReservaIndividual
from scheduler import service
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db

LOCMEM_BACKEND = "django.core.mail.backends.locmem.EmailBackend"


def _salon(nombre):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _persona(numero_documento, nombre, correo=None):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(
        numero_documento, nombre, tipo_persona.id, correo=correo
    )


def _usuario(email, nombre):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-usuario-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


def _actualizar_limites(limite_antes_mora_minutos=120, max_reintentos_recordatorio=3, limite_no_reclamada_minutos=30):
    configuracion = configuracion_service.obtener_configuracion()
    return configuracion_service.actualizar_configuracion(
        configuracion.ubicacion_defecto_id,
        limite_antes_mora_minutos,
        max_reintentos_recordatorio,
        limite_no_reclamada_minutos=limite_no_reclamada_minutos,
    )


def _llave_en_prestamo(suffix, correo_reclamado="reclamado@uco.edu.co"):
    salon = _salon(f"salon-llave-{suffix}")
    docente = _persona(f"3000000{suffix}", f"Docente {suffix}")
    reclamado_por = _persona(f"4000000{suffix}", f"Reclamado {suffix}", correo=correo_reclamado)
    usuario_entrega = _usuario(f"entrega-{suffix}@uco.edu.co", f"Portero {suffix}")
    ubicacion_entrega = catalogos_service.crear_ubicacion(
        f"ubicacion-entrega-{suffix}", permite_prestamo_llaves=True
    )
    return llaves_service.crear_llave(
        salon.id,
        docente.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion_entrega.id,
    )


def _reserva_aprobada(suffix, fecha, hora_inicio, hora_fin, correo_solicitante="solicitante@uco.edu.co"):
    salon = _salon(f"salon-reserva-{suffix}")
    solicitante = _persona(f"5000000{suffix}", f"Solicitante {suffix}", correo=correo_solicitante)
    return reservas_service.crear_reserva(salon.id, solicitante.id, fecha, hora_inicio, hora_fin)


# ------------------------------------------------------------------
# Camino feliz — llaves en mora
# ------------------------------------------------------------------


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_ejecutar_transiciones_marca_llave_en_mora_y_envia_primer_recordatorio():
    _actualizar_limites(limite_antes_mora_minutos=10, max_reintentos_recordatorio=3)
    llave = _llave_en_prestamo("1")
    ahora = llave.fecha_hora_entrega + datetime.timedelta(minutes=11)

    resultado = service.ejecutar_transiciones(ahora=ahora)

    assert resultado["llaves_marcadas_en_demora"] == 1
    assert resultado["recordatorios_enviados"] == 1
    assert resultado["recordatorios_omitidos_por_tope"] == 0
    assert resultado["errores"] == 0
    assert llaves_service.obtener_llave(llave.id).estado == EstadoLlave.DEMORA_ENTREGA
    assert notificaciones_service.contar_recordatorios_por_llave(llave.id) == 1
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["reclamado@uco.edu.co"]


# ------------------------------------------------------------------
# Camino feliz — reservas no reclamadas
# ------------------------------------------------------------------


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_ejecutar_transiciones_marca_reserva_no_reclamada_y_envia_vencimiento():
    _actualizar_limites(limite_no_reclamada_minutos=10)
    fecha = datetime.date(2026, 1, 1)
    hora_inicio = datetime.time(8, 0)
    reserva = _reserva_aprobada("1", fecha, hora_inicio, datetime.time(10, 0))
    ahora = timezone.make_aware(datetime.datetime.combine(fecha, hora_inicio)) + datetime.timedelta(
        minutes=11
    )

    resultado = service.ejecutar_transiciones(ahora=ahora)

    assert resultado["reservas_marcadas_no_reclamada"] == 1
    assert resultado["vencimientos_enviados"] == 1
    assert resultado["errores"] == 0
    assert (
        reservas_service.obtener_reserva(reserva.id).estado
        == EstadoReservaIndividual.NO_RECLAMADA
    )
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["solicitante@uco.edu.co"]


# ------------------------------------------------------------------
# Idempotencia
# ------------------------------------------------------------------


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_ejecutar_transiciones_doble_invocacion_con_mismo_ahora_no_repite_nada():
    # max_reintentos_recordatorio=1: el tope queda agotado justo con el
    # primer envío, así que la segunda corrida con el MISMO `ahora` no
    # tiene nada nuevo que hacer para la llave (ver docstring del módulo);
    # la reserva queda fuera de `listar_reservas_aprobadas_hasta` en
    # cuanto deja de estar 'aprobada', así que su idempotencia no depende
    # de ningún tope.
    _actualizar_limites(
        limite_antes_mora_minutos=10, max_reintentos_recordatorio=1, limite_no_reclamada_minutos=10
    )
    llave = _llave_en_prestamo("1")
    fecha = datetime.date(2026, 1, 1)
    _reserva_aprobada("1", fecha, datetime.time(8, 0), datetime.time(10, 0))
    ahora = llave.fecha_hora_entrega + datetime.timedelta(minutes=11)

    primero = service.ejecutar_transiciones(ahora=ahora)
    segundo = service.ejecutar_transiciones(ahora=ahora)

    assert primero["llaves_marcadas_en_demora"] == 1
    assert primero["recordatorios_enviados"] == 1
    assert primero["reservas_marcadas_no_reclamada"] == 1
    assert primero["vencimientos_enviados"] == 1

    assert segundo["llaves_marcadas_en_demora"] == 0
    assert segundo["recordatorios_enviados"] == 0
    assert segundo["reservas_marcadas_no_reclamada"] == 0
    assert segundo["vencimientos_enviados"] == 0
    assert segundo["errores"] == 0

    assert notificaciones_service.contar_recordatorios_por_llave(llave.id) == 1
    assert len(mail.outbox) == 2  # 1 recordatorio + 1 vencimiento, nada más


# ------------------------------------------------------------------
# Tope de reintentos
# ------------------------------------------------------------------


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_ejecutar_transiciones_no_envia_mas_alla_del_tope_de_reintentos():
    _actualizar_limites(limite_antes_mora_minutos=10, max_reintentos_recordatorio=2)
    llave = _llave_en_prestamo("1")
    ahora = llave.fecha_hora_entrega + datetime.timedelta(minutes=11)

    primero = service.ejecutar_transiciones(ahora=ahora)  # marca demora + intento 1
    segundo = service.ejecutar_transiciones(ahora=ahora)  # intento 2, todavía bajo el tope
    tercero = service.ejecutar_transiciones(ahora=ahora)  # tope (2) ya alcanzado

    assert primero["recordatorios_enviados"] == 1
    assert segundo["recordatorios_enviados"] == 1
    assert segundo["recordatorios_omitidos_por_tope"] == 0
    assert tercero["recordatorios_enviados"] == 0
    assert tercero["recordatorios_omitidos_por_tope"] == 1
    assert tercero["errores"] == 0
    assert notificaciones_service.contar_recordatorios_por_llave(llave.id) == 2


# ------------------------------------------------------------------
# Aislamiento por ítem
# ------------------------------------------------------------------


def test_ejecutar_transiciones_aisla_un_error_y_continua_con_el_resto():
    _actualizar_limites(limite_antes_mora_minutos=10, max_reintentos_recordatorio=3)
    llave_mala = _llave_en_prestamo("1")
    llave_buena = _llave_en_prestamo("2")
    ahora = max(llave_mala.fecha_hora_entrega, llave_buena.fecha_hora_entrega) + datetime.timedelta(
        minutes=11
    )
    original_marcar_demora = llaves_service.marcar_demora

    def _marcar_demora_falla_para_la_llave_mala(llave_id):
        if str(llave_id) == str(llave_mala.id):
            raise ValueError(f"No existe una llave con id {llave_id}")
        return original_marcar_demora(llave_id)

    with unittest.mock.patch(
        "scheduler.service.llaves_service.marcar_demora",
        side_effect=_marcar_demora_falla_para_la_llave_mala,
    ):
        resultado = service.ejecutar_transiciones(ahora=ahora)

    assert resultado["errores"] == 1
    assert resultado["llaves_marcadas_en_demora"] == 1
    assert llaves_service.obtener_llave(llave_mala.id).estado == EstadoLlave.EN_PRESTAMO
    assert llaves_service.obtener_llave(llave_buena.id).estado == EstadoLlave.DEMORA_ENTREGA


# ------------------------------------------------------------------
# Estados no elegibles quedan intactos
# ------------------------------------------------------------------


def test_ejecutar_transiciones_no_toca_llave_que_aun_no_esta_en_mora():
    _actualizar_limites(limite_antes_mora_minutos=30)
    llave = _llave_en_prestamo("1")
    ahora = llave.fecha_hora_entrega + datetime.timedelta(minutes=5)

    resultado = service.ejecutar_transiciones(ahora=ahora)

    assert resultado["llaves_marcadas_en_demora"] == 0
    assert resultado["recordatorios_enviados"] == 0
    assert llaves_service.obtener_llave(llave.id).estado == EstadoLlave.EN_PRESTAMO


def test_ejecutar_transiciones_no_toca_reserva_ya_completada():
    fecha = datetime.date(2026, 1, 1)
    reserva = _reserva_aprobada("1", fecha, datetime.time(8, 0), datetime.time(10, 0))
    reservas_service.completar_reserva(reserva.id)
    ahora = timezone.make_aware(datetime.datetime.combine(fecha, datetime.time(8, 0))) + datetime.timedelta(
        hours=5
    )

    resultado = service.ejecutar_transiciones(ahora=ahora)

    assert resultado["reservas_marcadas_no_reclamada"] == 0
    assert resultado["vencimientos_enviados"] == 0
    assert (
        reservas_service.obtener_reserva(reserva.id).estado
        == EstadoReservaIndividual.COMPLETADA
    )
