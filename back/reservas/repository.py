"""
repository.py — única capa del módulo reservas que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la única
entidad que este módulo posee: reserva_individual.

`listar_por_salon_y_fecha_aprobadas` es la consulta que `service.py` cruza
contra `domain.hay_solapamiento` antes de crear una nueva reserva —
equivalente en intención a
`programacion.repository.listar_programaciones_por_salon_y_dia`, pero
filtrando además por `estado='aprobada'` (ver docstring de `service.py`:
una reserva `cancelada`/`completada`/`no_reclamada` no bloquea el horario).

`cambiar_estado` es el único punto de escritura para las transiciones de
estado (`cancelar_reserva`/`completar_reserva` en `service.py`), mismo
patrón que `novedades.repository.cerrar_novedad`/`llaves.repository.
devolver_llave`: la decisión de si la transición es válida ya se tomó en
`service.py` antes de llegar acá.
"""

from reservas.model import EstadoReservaIndividual, ReservaIndividual


def listar_reservas():
    return list(ReservaIndividual.objects.order_by("-fecha", "hora_inicio"))


def crear_reserva(
    salon_id,
    solicitante_id,
    fecha,
    hora_inicio,
    hora_fin,
    motivo: str | None = None,
) -> ReservaIndividual:
    return ReservaIndividual.objects.create(
        salon_id=salon_id,
        solicitante_id=solicitante_id,
        fecha=fecha,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        motivo=motivo,
    )


def obtener_por_id(reserva_id):
    return ReservaIndividual.objects.filter(id=reserva_id).first()


def listar_por_salon_y_fecha_aprobadas(salon_id, fecha):
    return list(
        ReservaIndividual.objects.filter(
            salon_id=salon_id,
            fecha=fecha,
            estado=EstadoReservaIndividual.APROBADA,
        ).order_by("hora_inicio")
    )


def listar_por_solicitante(solicitante_id):
    return list(
        ReservaIndividual.objects.filter(solicitante_id=solicitante_id).order_by(
            "-fecha", "hora_inicio"
        )
    )


def cambiar_estado(reserva_id, nuevo_estado: str):
    reserva = ReservaIndividual.objects.filter(id=reserva_id).first()
    if reserva is None:
        return None
    reserva.estado = nuevo_estado
    reserva.save(update_fields=["estado"])
    return reserva
