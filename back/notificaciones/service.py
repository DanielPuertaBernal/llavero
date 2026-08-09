"""
service.py — API pública del módulo notificaciones.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
notificaciones — nunca importan `model.py`/`repository.py` de este
módulo directamente. Simétricamente, este módulo consume `comunidad`,
`usuarios` y `configuracion` exclusivamente vía sus respectivos
`.service` (nunca `.model`/`.repository` ajenos), la misma regla dura ya
aplicada en `llaves.service`/`monitores.service`.

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
como todavía inexistente. Construirlo es responsabilidad de un futuro
componente fuera de este módulo.

Gap relacionado, deliberadamente NO resuelto acá: `configuracion.
max_reintentos_recordatorio` expresa un límite de reintentos "por algo"
(en espíritu, por llave/préstamo vencido), pero el DDL de `notificacion`
NO tiene ninguna FK hacia `llave`/`prestamo` — esta tabla solo sabe a
QUIÉN se le mandó un mensaje y de qué tipo, nunca POR QUÉ llave/préstamo.
Sin esa columna, `notificaciones` no tiene forma de contar "cuántos
recordatorios van para esta llave específica" para aplicar el tope de
`max_reintentos_recordatorio`. Esa correlación y ese conteo quedan fuera
de alcance de este módulo por falta de soporte de datos en el DDL: el
futuro scheduler que dispare `enviar_recordatorio` es quien tendría que
llevar esa cuenta con su propio estado (o el DDL tendría que crecer una
columna/tabla nueva, decisión de negocio no tomada acá). No se inventa
ninguna de las dos cosas en este módulo.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT de una sola tabla, ya atómico de por sí en
Django (autocommit por sentencia). El intento de envío por SMTP ocurre
ANTES del INSERT (no dentro de una transacción que lo envuelva), así que
no hay ningún escenario de "notificación persistida pero rollback del
envío" o viceversa que coordinar.
"""

import smtplib

from django.conf import settings
from django.core.mail import send_mail

from comunidad import service as comunidad_service
from configuracion import service as configuracion_service
from notificaciones import repository
from notificaciones.model import EstadoEnvioNotificacion, TipoNotificacion
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
    )


def enviar_recordatorio(destinatario_id, mensaje: str | None = None):
    """Envía (o intenta) un recordatorio automático, validando primero que
    `destinatario_id` exista en comunidad.

    Si no se pasa `mensaje` explícito, usa `configuracion.service.
    obtener_configuracion().plantilla_recordatorio` como base (ver
    docstring del módulo, sección "FUERA DE ALCANCE", para qué NO cubre
    esta función: no decide CUÁNDO disparar el recordatorio ni cuenta
    reintentos contra `max_reintentos_recordatorio`, eso es
    responsabilidad de quien la invoque).

    `enviado_por_id` queda siempre `None`: no hay un usuario de staff
    detrás de un recordatorio automático.
    """
    destinatario = comunidad_service.obtener_persona(destinatario_id)
    if destinatario is None:
        raise ValueError(f"No existe un destinatario en comunidad con id {destinatario_id}")

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
    )


def enviar_vencimiento(destinatario_id, mensaje: str):
    """Envía (o intenta) una notificación de vencimiento automática,
    validando primero que `destinatario_id` exista en comunidad.

    Análoga a `enviar_recordatorio`, sin plantilla de configuracion (el
    DDL no la prevé para este tipo): `mensaje` siempre lo arma quien
    invoca. `enviado_por_id` queda siempre `None`, mismo motivo que
    `enviar_recordatorio`.
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
