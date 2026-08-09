"""
service.py — API pública del módulo notificaciones.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
notificaciones — nunca importan `model.py`/`repository.py` de este
módulo directamente. Simétricamente, este módulo consume `comunidad`,
`usuarios`, `configuracion`, `prestamos` y `llaves` exclusivamente vía sus
respectivos `.service` (nunca `.model`/`.repository` ajenos), la misma
regla dura ya aplicada en `llaves.service`/`monitores.service`.

Regla dura de dirección de import (agregada junto con `llave_id`, ver
`sdd/scheduler-transiciones`): `notificaciones.service` importa
`llaves.service`, así que `llaves.service` JAMÁS debe importar
`notificaciones.service` de vuelta — eso crearía un ciclo real. El
`enviar_recordatorio`/`enviar_vencimiento` de este módulo son primitivos
de "enviar y registrar"; quien decide CUÁNDO llamarlos (el futuro
scheduler, ver ese cambio) es el único orquestador que conoce ambos
módulos.

Convención de esta API, igual que el resto de módulos:
- `listar_*`/`obtener_notificacion` no lanzan excepción ante "no existe"/
  "sin resultados": devuelven `None`/lista vacía.
- `enviar_notificacion_manual`/`enviar_recordatorio`/`enviar_vencimiento`
  lanzan `ValueError` cuando `destinatario_id` (o, en el caso manual,
  `enviado_por_id`) no existen, igual patrón que `llaves.service.
  crear_llave` valida sus FKs contra los módulos dueños.

Nota de diseño — sin `domain.py`: a diferencia de módulos con reglas de
negocio puras no triviales (p. ej. `novedades.domain.validar_cierre`,
`monitores.domain.validar_docente_distinto_de_monitor`), la única lógica
de este módulo por fuera de "validar FKs" y "enviar/persistir" es "si no
me dan un mensaje explícito para el recordatorio, uso la plantilla de
configuracion" — una línea, sin reglas de forma que ameriten una función
propia. Mismo criterio ya aplicado en `catalogos`/`comunidad`/
`configuracion`/`equipos`: ese módulo tampoco tiene `domain.py` porque no
hay lógica pura no trivial que separar de la orquestación.

===========================================================================
ENVÍO REAL POR SMTP — decisiones de diseño
===========================================================================

Se usa `django.core.mail.send_mail`, el mecanismo estándar de Django, que
despacha a través del backend configurado en `settings.EMAIL_BACKEND`
(`django.core.mail.backends.smtp.EmailBackend` en este proyecto, ver
`config/settings.py`) — no se reimplementa un cliente SMTP a mano. Los
tests activan `django.core.mail.backends.locmem.EmailBackend` vía
`@override_settings` para el camino feliz (inspeccionando `django.core.
mail.outbox`, sin red real) y `unittest.mock.patch` sobre `send_mail`
para simular una falla de red en el camino de fallo.

`estado_envio` ('enviado'/'fallido') es el RESULTADO OBSERVADO de
intentar el envío real, nunca una decisión de negocio previa: por eso
todas las funciones `enviar_*` de este módulo intentan el envío primero
y recién después persisten la `Notificacion` con el estado que resultó.
La excepción de red NUNCA se deja propagar al caller — un envío fallido
es un resultado de negocio válido (se guarda igual, con estado_envio=
'fallido'), no un error del sistema que deba tumbar el request/llamada
que disparó la notificación.

Se captura específicamente `smtplib.SMTPException` (errores propios del
protocolo SMTP: respuesta rechazada, fallo de handshake, etc., que puede
lanzar `django.core.mail.backends.smtp.EmailBackend` con
`fail_silently=False`, el default de `send_mail`) y `OSError` (errores de
red/socket de bajo nivel: host inalcanzable, timeout de conexión, DNS —
`socket.error` es un alias de `OSError` desde Python 3, así que capturar
`OSError` ya lo cubre). No se captura `Exception` genérica a ciegas: un
`TypeError`/`ValueError` de programación (p. ej. pasar un tipo de dato
incorrecto) debe seguir propagando y rompiendo el test/request, no
disfrazarse de "notificación fallida" — solo los fallos de red/protocolo
observables en el intento de envío son un resultado de negocio.

Nota de diseño — destinatario sin `correo` registrado en `comunidad`
(campo nullable, ver `comunidad.model.Comunidad.correo`): se trata como
'fallido' sin siquiera intentar la llamada de red (`send_mail(None, ...)`
lanzaría un error de programación, no uno de protocolo/red, así que no
encajaría en el manejo de excepciones de arriba). Es la misma semántica
de negocio que un envío que sí se intentó y falló: no hay a dónde
mandarlo, así que el resultado observable es que la notificación no
llegó.

Nota de diseño — `EMAIL_HOST_FALLBACK` (env var documentada en
`env.example`, IP del mismo relay `mail.uco.edu.co`) NO se usa en este
código: es información operativa de referencia para quien administre el
relay, no una decisión de negocio pedida por este módulo. Implementar
failover automático (reintentar contra la IP si el hostname falla)
agregaría lógica de reintento/resolución de red no solicitada y sin
casos de prueba definidos; si en el futuro se decide, es un cambio
explícito y separado sobre `EMAIL_BACKEND`/`settings.py`, no algo que
`notificaciones.service` deba inventar ahora.

===========================================================================
FUERA DE ALCANCE — motor de disparo automático
===========================================================================

Este módulo expone `enviar_recordatorio`/`enviar_vencimiento` como
funciones que YA envían y persisten cuando algo las llama, pero no existe
ningún cron/scheduler/celery-beat en este backend que las dispare
automáticamente cuando corresponde (al vencer `limite_antes_mora_minutos`
o similar) — ver la nota de `configuracion.service.obtener_configuracion`
("probablemente un cron/celery beat"), que menciona ese mismo componente
como todavía inexistente. Construirlo sigue siendo responsabilidad de un
futuro componente fuera de este módulo.

Gap ya RESUELTO (ver `model.py` para el detalle de columnas): el DDL de
`notificacion` ahora tiene `prestamo_id`/`numero_intento`/`fecha_hora`/
`llave_id`, así que `enviar_recordatorio` sí puede correlacionar cada
recordatorio con el préstamo o la llave que lo motivó y con qué número
de intento es. Antes de esta versión, la tabla no sabía POR QUÉ préstamo/
llave se mandaba cada recordatorio, lo que bloqueaba aplicar
`configuracion.max_reintentos_recordatorio` (un límite "por préstamo/
llave vencido"). Eso ya no aplica: ambos datos de correlación existen y
se persisten (`contar_recordatorios_por_llave` ya permite consultar
cuántos van para una llave dada).

Gap que SIGUE fuera de alcance, deliberadamente NO resuelto acá: tener
las columnas y el contador no significa que exista el motor que las use.
Esta función sigue sin decidir CUÁNDO disparar un recordatorio ni CUÁL
`numero_intento` pasar — sigue recibiendo esos datos (`prestamo_id`/
`llave_id`, `numero_intento`) de quien la invoca, y sigue sin comparar
`numero_intento`/`contar_recordatorios_por_llave` contra
`max_reintentos_recordatorio` para decidir si debe enviarse o no. Esa
decisión (contar intentos previos, compararlos contra el tope de
`configuracion`, y decidir si vale la pena seguir reintentando) es
responsabilidad del futuro scheduler que orqueste estas llamadas (ver
`sdd/scheduler-transiciones`, todavía no construido — es un cambio
posterior, separado de éste), no de `enviar_recordatorio`: este método
sigue siendo un primitivo de "enviar y registrar", no el motor de
política de reintentos.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT de una sola tabla, ya atómico de por sí en
Django (autocommit por sentencia). El intento de envío por SMTP ocurre
ANTES del INSERT (no dentro de una transacción que lo envuelva), así que
no hay ningún escenario de "notificación persistida pero rollback del
envío" o viceversa que coordinar.

===========================================================================
`fecha_hora` — auditoría de envío en las 3 funciones `enviar_*`
===========================================================================

Las 3 funciones `enviar_notificacion_manual`/`enviar_recordatorio`/
`enviar_vencimiento` setean `fecha_hora=timezone.now()` al persistir,
no solo `enviar_recordatorio` (que es la que motivó agregar la columna).
Razón: `fecha_hora` es información general de auditoría ("cuándo se
envió/intentó enviar esta notificación"), no un dato específico de la
correlación préstamo/recordatorio — no hay ninguna razón de negocio para
que una notificación `'manual'`/`'vencimiento'` no tenga ese mismo dato
de auditoría solo por no llevar `prestamo_id`/`numero_intento`. Mismo
timestamp único por operación que ya usa `prestamos.repository.
marcar_detalle_devuelto` (un solo `timezone.now()` calculado en la capa
de negocio, nunca dentro del repository).
"""

import smtplib

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from comunidad import service as comunidad_service
from configuracion import service as configuracion_service
from llaves import service as llaves_service
from notificaciones import repository
from notificaciones.model import EstadoEnvioNotificacion, TipoNotificacion
from prestamos import service as prestamos_service
from usuarios import service as usuarios_service


def _intentar_envio(destinatario, asunto: str | None, mensaje: str | None) -> str:
    """Intenta el envío real por SMTP y devuelve el `estado_envio`
    resultante ('enviado'/'fallido'). Ver la nota de diseño del módulo
    (encabezado de este archivo) para el detalle completo de qué se
    captura y por qué.
    """
    if not destinatario.correo:
        return EstadoEnvioNotificacion.FALLIDO
    try:
        send_mail(
            asunto or "",
            mensaje or "",
            settings.DEFAULT_FROM_EMAIL,
            [destinatario.correo],
            fail_silently=False,
        )
    except (smtplib.SMTPException, OSError):
        return EstadoEnvioNotificacion.FALLIDO
    return EstadoEnvioNotificacion.ENVIADO


def enviar_notificacion_manual(destinatario_id, asunto: str, mensaje: str, enviado_por_id):
    """Envía (o intenta) un mensaje puntual de un `Usuario` de staff hacia
    una persona de `comunidad`, validando primero que ambas referencias
    existan — lanza `ValueError` claro en cualquiera de los dos casos, en
    vez de dejar propagar el `IntegrityError` crudo de Postgres.

    `enviado_por_id` siempre queda registrado en la Notificacion
    resultante: es la marca de que esta notificación, a diferencia de
    'recordatorio'/'vencimiento', la disparó una persona concreta.

    `fecha_hora` queda siempre en `timezone.now()` (ver docstring del
    módulo, sección "`fecha_hora` — auditoría de envío"): es auditoría
    general, no un dato exclusivo de `enviar_recordatorio`.
    """
    destinatario = comunidad_service.obtener_persona(destinatario_id)
    if destinatario is None:
        raise ValueError(f"No existe un destinatario en comunidad con id {destinatario_id}")
    if usuarios_service.obtener_usuario(enviado_por_id) is None:
        raise ValueError(f"No existe un usuario (enviado_por) con id {enviado_por_id}")

    estado_envio = _intentar_envio(destinatario, asunto, mensaje)
    return repository.crear_notificacion(
        destinatario_id,
        TipoNotificacion.MANUAL,
        estado_envio,
        asunto=asunto,
        mensaje=mensaje,
        enviado_por_id=enviado_por_id,
        fecha_hora=timezone.now(),
    )


def enviar_recordatorio(
    destinatario_id,
    mensaje: str | None = None,
    prestamo_id=None,
    numero_intento=None,
    llave_id=None,
):
    """Envía (o intenta) un recordatorio automático, validando primero que
    `destinatario_id` exista en comunidad y, si se pasa `prestamo_id`/
    `llave_id`, que esa referencia también exista (vía `prestamos.service.
    obtener_prestamo`/`llaves.service.obtener_llave`, la única forma
    permitida de tocar `prestamos`/`llaves` desde este módulo — ver
    docstring del módulo).

    `prestamo_id`/`llave_id` son dos correlaciones ALTERNATIVAS, nunca
    simultáneas (ver `model.py`, `ck_notificacion_correlacion_unica`):
    pasar ambos a la vez lanza `ValueError` antes de tocar la base de
    datos, en vez de dejar propagar el `IntegrityError` crudo de Postgres
    — mismo criterio de "error claro" que el resto de validaciones de
    este método.

    `prestamo_id`/`llave_id`/`numero_intento` son opcionales (default
    `None`): correlacionan este recordatorio con el préstamo/llave que lo
    motivó y con qué intento es, pero esta función NO decide cuándo debe
    dispararse un recordatorio ni compara `numero_intento` contra
    `configuracion.max_reintentos_recordatorio` — ver docstring del
    módulo, sección "FUERA DE ALCANCE", para el detalle de qué sigue
    pendiente y por qué.

    Si no se pasa `mensaje` explícito, usa `configuracion.service.
    obtener_configuracion().plantilla_recordatorio` como base.

    `enviado_por_id` queda siempre `None`: no hay un usuario de staff
    detrás de un recordatorio automático. `fecha_hora` queda siempre en
    `timezone.now()`.
    """
    destinatario = comunidad_service.obtener_persona(destinatario_id)
    if destinatario is None:
        raise ValueError(f"No existe un destinatario en comunidad con id {destinatario_id}")
    if prestamo_id is not None and llave_id is not None:
        raise ValueError(
            "No se puede pasar prestamo_id y llave_id a la vez: son dos "
            "correlaciones alternativas, nunca simultáneas"
        )
    if prestamo_id is not None and prestamos_service.obtener_prestamo(prestamo_id) is None:
        raise ValueError(f"No existe un préstamo con id {prestamo_id}")
    if llave_id is not None and llaves_service.obtener_llave(llave_id) is None:
        raise ValueError(f"No existe una llave con id {llave_id}")

    if mensaje is None:
        mensaje = configuracion_service.obtener_configuracion().plantilla_recordatorio

    estado_envio = _intentar_envio(destinatario, None, mensaje)
    return repository.crear_notificacion(
        destinatario_id,
        TipoNotificacion.RECORDATORIO,
        estado_envio,
        asunto=None,
        mensaje=mensaje,
        enviado_por_id=None,
        prestamo_id=prestamo_id,
        numero_intento=numero_intento,
        fecha_hora=timezone.now(),
        llave_id=llave_id,
    )


def enviar_vencimiento(destinatario_id, mensaje: str):
    """Envía (o intenta) una notificación de vencimiento automática,
    validando primero que `destinatario_id` exista en comunidad.

    Análoga a `enviar_recordatorio`, sin plantilla de configuracion (el
    DDL no la prevé para este tipo): `mensaje` siempre lo arma quien
    invoca. `enviado_por_id` queda siempre `None`, mismo motivo que
    `enviar_recordatorio`. No recibe `prestamo_id`/`numero_intento`: esos
    dos son específicos de la correlación de reintentos de
    `enviar_recordatorio` (ver docstring del módulo); un vencimiento no
    cuenta contra `max_reintentos_recordatorio`. `fecha_hora` sí queda
    siempre en `timezone.now()`, igual que en las otras dos funciones
    `enviar_*` (es auditoría general, no exclusiva del recordatorio).
    """
    destinatario = comunidad_service.obtener_persona(destinatario_id)
    if destinatario is None:
        raise ValueError(f"No existe un destinatario en comunidad con id {destinatario_id}")

    estado_envio = _intentar_envio(destinatario, None, mensaje)
    return repository.crear_notificacion(
        destinatario_id,
        TipoNotificacion.VENCIMIENTO,
        estado_envio,
        asunto=None,
        mensaje=mensaje,
        enviado_por_id=None,
        fecha_hora=timezone.now(),
    )


def listar_notificaciones():
    return repository.listar_notificaciones()


def obtener_notificacion(notificacion_id):
    """Devuelve la Notificacion con ese id, o None si no existe."""
    return repository.obtener_por_id(notificacion_id)


def listar_por_destinatario(destinatario_id):
    return repository.listar_por_destinatario(destinatario_id)


def listar_por_tipo(tipo: str):
    return repository.listar_por_tipo(tipo)


def listar_por_estado_envio(estado_envio: str):
    return repository.listar_por_estado_envio(estado_envio)


def contar_recordatorios_por_llave(llave_id) -> int:
    return repository.contar_recordatorios_por_llave(llave_id)
