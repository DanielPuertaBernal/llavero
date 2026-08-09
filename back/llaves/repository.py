"""
repository.py — única capa del módulo llaves que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: llave.

`devolver_llave` recibe `fecha_hora_devolucion` ya calculada desde
`service.py` (nunca `timezone.now()` calculado acá adentro) — mismo
patrón documentado en `auth.repository`: un único timestamp consistente
por operación de negocio, y `domain.py`/`service.py` pueden testear con
un "ahora" fijo sin depender del reloj real.

`listar_por_estado` es la consulta de triage típica ("¿qué llaves siguen
sin devolverse?", equivalente a `listar_por_estado(EstadoLlave.EN_
PRESTAMO)`), igual criterio que `novedades.repository.listar_por_estado`.
`listar_por_docente_titular` es la consulta que el índice
`idx_llave_docente_titular` del DDL anticipa (ver model.py, nota de
diseño) — misma intención que
`programacion.repository.listar_programaciones_por_docente`.
"""

from llaves.model import EstadoLlave, Llave


def listar_llaves():
    return list(Llave.objects.order_by("-fecha_hora_entrega"))


def crear_llave(
    salon_id,
    docente_titular_id,
    reclamado_por_id,
    origen: str,
    tipo_entrega: str,
    usuario_entrega_id,
    ubicacion_entrega_id,
) -> Llave:
    return Llave.objects.create(
        salon_id=salon_id,
        docente_titular_id=docente_titular_id,
        reclamado_por_id=reclamado_por_id,
        origen=origen,
        tipo_entrega=tipo_entrega,
        usuario_entrega_id=usuario_entrega_id,
        ubicacion_entrega_id=ubicacion_entrega_id,
    )


def obtener_por_id(llave_id):
    return Llave.objects.filter(id=llave_id).first()


def listar_por_estado(estado: str):
    return list(
        Llave.objects.filter(estado=estado).order_by("-fecha_hora_entrega")
    )


def listar_por_docente_titular(docente_titular_id):
    return list(
        Llave.objects.filter(docente_titular_id=docente_titular_id).order_by(
            "-fecha_hora_entrega"
        )
    )


def devolver_llave(
    llave_id,
    usuario_recibe_id,
    ubicacion_devolucion_id,
    tipo_devolucion: str,
    fecha_hora_devolucion,
    novedad_id=None,
):
    """Pone estado='entregado' y guarda los datos de la devolución en la
    Llave con ese id, o devuelve None si no existe. Las validaciones de
    que las referencias existan y de que `ubicacion_devolucion_id`
    permita devolución de llaves pasan por domain.py/service.py antes de
    llegar acá — este método asume que esas decisiones ya se tomaron
    (mismo patrón que `novedades.repository.cerrar_novedad`)."""
    llave = Llave.objects.filter(id=llave_id).first()
    if llave is None:
        return None
    llave.estado = EstadoLlave.ENTREGADO
    llave.fecha_hora_devolucion = fecha_hora_devolucion
    llave.usuario_recibe_id = usuario_recibe_id
    llave.ubicacion_devolucion_id = ubicacion_devolucion_id
    llave.tipo_devolucion = tipo_devolucion
    llave.novedad_id = novedad_id
    llave.save(
        update_fields=[
            "estado",
            "fecha_hora_devolucion",
            "usuario_recibe_id",
            "ubicacion_devolucion_id",
            "tipo_devolucion",
            "novedad_id",
        ]
    )
    return llave
