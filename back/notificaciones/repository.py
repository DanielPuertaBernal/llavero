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
"""

from notificaciones.model import Notificacion


def crear_notificacion(
    destinatario_id,
    tipo: str,
    estado_envio: str,
    asunto: str | None = None,
    mensaje: str | None = None,
    enviado_por_id=None,
) -> Notificacion:
    return Notificacion.objects.create(
        destinatario_id=destinatario_id,
        tipo=tipo,
        asunto=asunto,
        mensaje=mensaje,
        estado_envio=estado_envio,
        enviado_por_id=enviado_por_id,
    )


def listar_notificaciones():
    # Sin campo de fecha en el DDL (ver model.py, nota de diseño), se
    # ordena por tipo/estado_envio para agrupar notificaciones del mismo
    # tipo — mismo criterio que `novedades.repository.listar_novedades`.
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
