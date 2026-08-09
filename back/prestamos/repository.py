"""
repository.py — única capa del módulo prestamos que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para las 3
tablas que este módulo posee: prestamo, detalle_prestamo, devolucion.

`marcar_detalle_devuelto` recibe `fecha_devolucion` ya calculada desde
`service.py` (nunca `timezone.now()` calculado acá adentro) — mismo
patrón documentado en `llaves.repository`/`auth.repository`: un único
timestamp consistente por operación de negocio (compartido por todos
los detalles que se devuelven en la misma llamada a
`service.devolver_equipos`), y `domain.py`/`service.py` pueden testear
con un "ahora" fijo sin depender del reloj real.

`existe_detalle_entregado_para_equipo` es la consulta que sostiene el
pre-check de disponibilidad de `domain.validar_equipo_disponible` (ver
la Nota de diseño en `model.py` sobre por qué este módulo, a diferencia
de `llaves`, sí anticipa esa validación en vez de dejarla solo al
`UniqueConstraint` de BD).

`listar_prestamos_por_estado` es la consulta de triage típica
("¿qué préstamos siguen activos/parcialmente devueltos?"), igual
criterio que `llaves.repository.listar_por_estado`/
`novedades.repository.listar_por_estado`.
"""

from prestamos.model import (
    Devolucion,
    DetallePrestamo,
    EstadoDetalleEquipo,
    Prestamo,
)


# ------------------------------------------------------------------
# Prestamo
# ------------------------------------------------------------------


def listar_prestamos():
    return list(Prestamo.objects.order_by("-fecha_creacion"))


def crear_prestamo(solicitante_id, usuario_prestamista_id, ubicacion_id) -> Prestamo:
    return Prestamo.objects.create(
        solicitante_id=solicitante_id,
        usuario_prestamista_id=usuario_prestamista_id,
        ubicacion_id=ubicacion_id,
    )


def obtener_prestamo(prestamo_id):
    return Prestamo.objects.filter(id=prestamo_id).first()


def listar_prestamos_por_solicitante(solicitante_id):
    return list(
        Prestamo.objects.filter(solicitante_id=solicitante_id).order_by(
            "-fecha_creacion"
        )
    )


def listar_prestamos_por_estado(estado: str):
    return list(Prestamo.objects.filter(estado=estado).order_by("-fecha_creacion"))


def actualizar_estado_prestamo(prestamo_id, estado: str):
    prestamo = Prestamo.objects.filter(id=prestamo_id).first()
    if prestamo is None:
        return None
    prestamo.estado = estado
    prestamo.save(update_fields=["estado"])
    return prestamo


# ------------------------------------------------------------------
# DetallePrestamo
# ------------------------------------------------------------------


def crear_detalle_prestamo(prestamo_id, equipo_id) -> DetallePrestamo:
    return DetallePrestamo.objects.create(prestamo_id=prestamo_id, equipo_id=equipo_id)


def listar_detalles_por_prestamo(prestamo_id):
    return list(
        DetallePrestamo.objects.filter(prestamo_id=prestamo_id).order_by(
            "fecha_entrega"
        )
    )


def obtener_detalle_por_prestamo_y_equipo(prestamo_id, equipo_id):
    return DetallePrestamo.objects.filter(
        prestamo_id=prestamo_id, equipo_id=equipo_id
    ).first()


def existe_detalle_entregado_para_equipo(equipo_id) -> bool:
    return DetallePrestamo.objects.filter(
        equipo_id=equipo_id, estado_equipo=EstadoDetalleEquipo.ENTREGADO
    ).exists()


def marcar_detalle_devuelto(detalle_id, fecha_devolucion, novedad_id=None):
    detalle = DetallePrestamo.objects.filter(id=detalle_id).first()
    if detalle is None:
        return None
    detalle.estado_equipo = EstadoDetalleEquipo.DEVUELTO
    detalle.fecha_devolucion = fecha_devolucion
    detalle.novedad_id = novedad_id
    detalle.save(update_fields=["estado_equipo", "fecha_devolucion", "novedad_id"])
    return detalle


# ------------------------------------------------------------------
# Devolucion
# ------------------------------------------------------------------


def crear_devolucion(
    prestamo_id, usuario_recibe_id, ubicacion_id, es_completa: bool
) -> Devolucion:
    return Devolucion.objects.create(
        prestamo_id=prestamo_id,
        usuario_recibe_id=usuario_recibe_id,
        ubicacion_id=ubicacion_id,
        es_completa=es_completa,
    )


def listar_devoluciones_por_prestamo(prestamo_id):
    return list(
        Devolucion.objects.filter(prestamo_id=prestamo_id).order_by("-fecha")
    )
