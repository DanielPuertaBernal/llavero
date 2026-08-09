"""
repository.py — única capa del módulo notificaciones que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: notificacion.

`crear_notificacion` recibe `estado_envio` ya resuelto (no lo calcula
acá): el intento real de envío por SMTP ocurre en `service.py` (la única
capa con acceso a `django.core.mail`), que decide 'enviado'/'fallido'
según el resultado observado y pasa ese valor ya cerrado a este método —
igual separación de responsabilidades que `novedades.repository.
crear_novedad` recibe `categoria` ya validada por quien llama.

`prestamo_id`/`numero_intento`/`fecha_hora` son kwargs opcionales
(default `None`) igual que `enviado_por_id`: este método no valida nada
de negocio (que el préstamo exista, etc.) — esa validación vive en
`service.py` (ver `service.enviar_recordatorio`). Este método solo los
pasa tal cual a `Notificacion.objects.create`, mismo criterio que ya
aplicaba a `enviado_por_id`.
"""

from notificaciones.model import Notificacion


def crear_notificacion(
    destinatario_id,
    tipo: str,
    estado_envio: str,
    asunto: str | None = None,
    mensaje: str | None = None,
    enviado_por_id=None,
    prestamo_id=None,
    numero_intento=None,
    fecha_hora=None,
) -> Notificacion:
    return Notificacion.objects.create(
        destinatario_id=destinatario_id,
        tipo=tipo,
        asunto=asunto,
        mensaje=mensaje,
        estado_envio=estado_envio,
        enviado_por_id=enviado_por_id,
        prestamo_id=prestamo_id,
        numero_intento=numero_intento,
        fecha_hora=fecha_hora,
    )


def listar_notificaciones():
    # Se sigue ordenando por tipo/estado_envio, no por `fecha_hora`: esa
    # columna es nullable (ver model.py, nota de diseño) y no todas las
    # notificaciones existentes antes de esa migración la tienen poblada,
    # así que ordenar por ella dejaría los `NULL` mezclados de forma poco
    # predecible. Mismo criterio que `novedades.repository.
    # listar_novedades`.
    return list(Notificacion.objects.order_by("tipo", "estado_envio"))


def obtener_por_id(notificacion_id):
    return Notificacion.objects.filter(id=notificacion_id).first()


def listar_por_destinatario(destinatario_id):
    return list(
        Notificacion.objects.filter(destinatario_id=destinatario_id).order_by("tipo")
    )


def listar_por_tipo(tipo: str):
    return list(Notificacion.objects.filter(tipo=tipo).order_by("estado_envio"))


def listar_por_estado_envio(estado_envio: str):
    return list(Notificacion.objects.filter(estado_envio=estado_envio).order_by("tipo"))
