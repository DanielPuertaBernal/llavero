"""
service.py — API pública del módulo scheduler: `ejecutar_transiciones`,
el único orquestador cross-módulo del proyecto que conoce a la vez
`llaves`, `reservas`, `notificaciones` y `configuracion` (ver
sdd/scheduler-transiciones/design).

Este módulo NO tiene tabla propia (ver docstring de `apps.py`), así que
no hay `repository.py` acá — igual que `nfc.service`, orquesta llamando
exclusivamente a los `.service` (y a las funciones puras de `.domain`,
ver decisión de diseño 3) de módulos ya construidos, nunca a sus
`.model`/`.repository`.

Snapshot antes de mutar (decisión de diseño 7): las tres listas
(`en_prestamo`, `demora_entrega`, reservas aprobadas hasta `ahora.date()`)
se consultan TODAS antes de procesar cualquier fila. Si no se hiciera
así, una llave recién transicionada a `demora_entrega` en el paso A
reaparecería en una relectura del paso B y recibiría dos recordatorios en
la misma corrida.

Dos pasadas sobre llaves, no una:
- Paso A (`en_prestamo`): decide si ya está en mora
  (`llaves.domain.es_mora`); si sí, transiciona
  (`llaves.service.marcar_demora`) y evalúa si corresponde el primer
  recordatorio.
- Paso B (`demora_entrega`, ya transicionadas en corridas anteriores):
  NO vuelve a evaluar `es_mora` (ya están en mora por definición de estar
  en ese estado) — solo evalúa si corresponde un recordatorio adicional,
  contra el tope de `configuracion.max_reintentos_recordatorio`
  (`scheduler.domain.debe_enviar_recordatorio`). Esta pasada es la que
  hace que invocaciones repetidas sigan enviando recordatorios (hasta el
  tope) para una llave que sigue sin devolverse — ver Risks del diseño:
  no hay intervalo mínimo entre recordatorios, el tope es la única
  protección.

Aislamiento por ítem (decisión de diseño 8): cada llave/reserva se
procesa dentro de su propio `try/except ValueError`, incrementando
`errores` sin abortar el resto del lote — una fila con datos corruptos o
una referencia borrada no debe congelar el resto de las transiciones en
una corrida desatendida.

`ahora=None` (decisión de diseño 2b): si no se pasa, se usa un único
`timezone.now()` para toda la corrida (mismo timestamp para las tres
decisiones de umbral), igual criterio que `llaves.repository`/
`prestamos.repository.marcar_detalle_devuelto`. Los tests lo inyectan
porque `Llave.fecha_hora_entrega` es `auto_now_add=True` y no se puede
fijar directamente en una fixture.
"""

from django.utils import timezone

from configuracion import service as configuracion_service
from llaves import domain as llaves_domain
from llaves import service as llaves_service
from notificaciones import service as notificaciones_service
from reservas import domain as reservas_domain
from reservas import service as reservas_service
from scheduler import domain

ESTADO_LLAVE_EN_PRESTAMO = "en_prestamo"
ESTADO_LLAVE_DEMORA_ENTREGA = "demora_entrega"


def _contadores_iniciales() -> dict:
    return {
        "llaves_marcadas_en_demora": 0,
        "recordatorios_enviados": 0,
        "recordatorios_omitidos_por_tope": 0,
        "reservas_marcadas_no_reclamada": 0,
        "vencimientos_enviados": 0,
        "errores": 0,
    }


def _enviar_recordatorio_si_corresponde(llave, max_reintentos_recordatorio: int, contadores: dict) -> None:
    """Evalúa el tope de reintentos (`scheduler.domain.
    debe_enviar_recordatorio`) contra `notificaciones.service.
    contar_recordatorios_por_llave` y, si corresponde, envía el siguiente
    recordatorio correlacionado a esta llave. Si no corresponde (tope ya
    alcanzado), solo cuenta el omitido — NO es un error."""
    intentos_previos = notificaciones_service.contar_recordatorios_por_llave(llave.id)
    if not domain.debe_enviar_recordatorio(intentos_previos, max_reintentos_recordatorio):
        contadores["recordatorios_omitidos_por_tope"] += 1
        return
    notificaciones_service.enviar_recordatorio(
        destinatario_id=llave.reclamado_por_id,
        llave_id=llave.id,
        numero_intento=intentos_previos + 1,
    )
    contadores["recordatorios_enviados"] += 1


def _mensaje_vencimiento(reserva) -> str:
    return (
        f"La reserva del salón {reserva.salon_id} para el {reserva.fecha} "
        f"a las {reserva.hora_inicio} fue marcada como no reclamada."
    )


def ejecutar_transiciones(ahora=None) -> dict:
    """Ejecuta, en una sola corrida, las dos transiciones automáticas por
    tiempo de este proyecto (ver docstring del módulo para el detalle de
    diseño de cada decisión):

    1. Llaves `en_prestamo` que ya pasaron `configuracion.
       limite_antes_mora_minutos` -> `demora_entrega`, con su
       recordatorio correspondiente si el tope de reintentos lo permite.
    2. Reservas `aprobada` cuya franja empezó hace más de `configuracion.
       limite_no_reclamada_minutos` -> `no_reclamada`, con un único
       `enviar_vencimiento` (sin tope, sin reintento).

    Devuelve un dict de conteos, siempre presente y siempre con enteros
    (nunca lanza por una fila individual fallida — ver `errores`).
    """
    if ahora is None:
        ahora = timezone.now()

    configuracion = configuracion_service.obtener_configuracion()
    limite_antes_mora_minutos = configuracion.limite_antes_mora_minutos
    max_reintentos_recordatorio = configuracion.max_reintentos_recordatorio
    limite_no_reclamada_minutos = configuracion.limite_no_reclamada_minutos

    llaves_en_prestamo = llaves_service.listar_llaves_por_estado(ESTADO_LLAVE_EN_PRESTAMO)
    llaves_en_demora = llaves_service.listar_llaves_por_estado(ESTADO_LLAVE_DEMORA_ENTREGA)
    reservas_aprobadas = reservas_service.listar_reservas_aprobadas_hasta(ahora.date())

    contadores = _contadores_iniciales()

    # Paso A: en_prestamo -> mora -> demora_entrega + primer recordatorio.
    for llave in llaves_en_prestamo:
        try:
            if not llaves_domain.es_mora(llave.fecha_hora_entrega, limite_antes_mora_minutos, ahora):
                continue
            llaves_service.marcar_demora(llave.id)
            contadores["llaves_marcadas_en_demora"] += 1
            _enviar_recordatorio_si_corresponde(llave, max_reintentos_recordatorio, contadores)
        except ValueError:
            contadores["errores"] += 1

    # Paso B: demora_entrega (ya transicionadas antes de esta corrida) ->
    # siguiente recordatorio si el tope lo permite.
    for llave in llaves_en_demora:
        try:
            _enviar_recordatorio_si_corresponde(llave, max_reintentos_recordatorio, contadores)
        except ValueError:
            contadores["errores"] += 1

    # Paso C: aprobadas -> no reclamadas -> vencimiento (único, sin tope).
    for reserva in reservas_aprobadas:
        try:
            if not reservas_domain.es_no_reclamada(
                reserva.fecha, reserva.hora_inicio, limite_no_reclamada_minutos, ahora
            ):
                continue
            reservas_service.marcar_no_reclamada(reserva.id)
            contadores["reservas_marcadas_no_reclamada"] += 1
            notificaciones_service.enviar_vencimiento(reserva.solicitante_id, _mensaje_vencimiento(reserva))
            contadores["vencimientos_enviados"] += 1
        except ValueError:
            contadores["errores"] += 1

    return contadores
