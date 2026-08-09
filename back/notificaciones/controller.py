"""
controller.py — router de Django Ninja del módulo notificaciones.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.
"""

import uuid

from ninja import Router, Schema

from notificaciones import service
from notificaciones.model import EstadoEnvioNotificacion, TipoNotificacion

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class NotificacionOut(Schema):
    id: uuid.UUID
    destinatario_id: uuid.UUID
    tipo: TipoNotificacion
    asunto: str | None
    mensaje: str | None
    estado_envio: EstadoEnvioNotificacion
    enviado_por_id: uuid.UUID | None


class NotificacionManualIn(Schema):
    destinatario_id: uuid.UUID
    asunto: str
    mensaje: str
    enviado_por_id: uuid.UUID


class RecordatorioIn(Schema):
    destinatario_id: uuid.UUID
    mensaje: str | None = None


class VencimientoIn(Schema):
    destinatario_id: uuid.UUID
    mensaje: str


# ------------------------------------------------------------------
# Notificacion
# ------------------------------------------------------------------


@router.get("/", response=list[NotificacionOut])
def listar_notificaciones(request):
    return service.listar_notificaciones()


@router.get("/{notificacion_id}", response={200: NotificacionOut, 404: dict})
def obtener_notificacion(request, notificacion_id: uuid.UUID):
    notificacion = service.obtener_notificacion(notificacion_id)
    if notificacion is None:
        return 404, {"detail": "Notificación no encontrada"}
    return 200, notificacion


@router.post("/manual", response={201: NotificacionOut, 400: dict})
def enviar_notificacion_manual(request, payload: NotificacionManualIn):
    try:
        notificacion = service.enviar_notificacion_manual(
            payload.destinatario_id,
            payload.asunto,
            payload.mensaje,
            payload.enviado_por_id,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, notificacion


@router.post("/recordatorio", response={201: NotificacionOut, 400: dict})
def enviar_recordatorio(request, payload: RecordatorioIn):
    try:
        notificacion = service.enviar_recordatorio(payload.destinatario_id, payload.mensaje)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, notificacion


@router.post("/vencimiento", response={201: NotificacionOut, 400: dict})
def enviar_vencimiento(request, payload: VencimientoIn):
    try:
        notificacion = service.enviar_vencimiento(payload.destinatario_id, payload.mensaje)
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, notificacion


@router.get("/destinatario/{destinatario_id}", response=list[NotificacionOut])
def listar_por_destinatario(request, destinatario_id: uuid.UUID):
    return service.listar_por_destinatario(destinatario_id)


@router.get("/tipo/{tipo}", response=list[NotificacionOut])
def listar_por_tipo(request, tipo: TipoNotificacion):
    return service.listar_por_tipo(tipo)


@router.get("/estado-envio/{estado_envio}", response=list[NotificacionOut])
def listar_por_estado_envio(request, estado_envio: EstadoEnvioNotificacion):
    return service.listar_por_estado_envio(estado_envio)
