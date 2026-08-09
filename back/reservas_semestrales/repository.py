"""
repository.py — única capa del módulo reservas_semestrales que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la única
entidad que este módulo posee: reserva_semestral.

`listar_por_salon_y_dia` es la consulta que `service.py` cruza contra
`domain.hay_solapamiento` antes de crear una nueva franja — equivalente en
intención a `programacion.repository.listar_programaciones_por_salon_y_dia`
(ver docstring de `service.py`).

`listar_por_grupo`/`eliminar_por_grupo` son las consultas que
`service.cancelar_grupo` usa para leer y borrar todas las franjas de una
misma solicitud (`grupo_id`).
"""

from reservas_semestrales.model import ReservaSemestral


def listar_reservas_semestrales():
    return list(ReservaSemestral.objects.order_by("dia", "hora_inicio"))


def crear_reserva_semestral(
    salon_id,
    solicitante_id,
    semestre_id,
    dia: str,
    hora_inicio,
    hora_fin,
    grupo_id,
    creado_manualmente: bool = True,
) -> ReservaSemestral:
    return ReservaSemestral.objects.create(
        salon_id=salon_id,
        solicitante_id=solicitante_id,
        semestre_id=semestre_id,
        dia=dia,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        grupo_id=grupo_id,
        creado_manualmente=creado_manualmente,
    )


def obtener_por_id(reserva_id):
    return ReservaSemestral.objects.filter(id=reserva_id).first()


def listar_por_grupo(grupo_id):
    return list(
        ReservaSemestral.objects.filter(grupo_id=grupo_id).order_by(
            "dia", "hora_inicio"
        )
    )


def listar_por_salon_y_dia(salon_id, dia: str):
    return list(
        ReservaSemestral.objects.filter(salon_id=salon_id, dia=dia).order_by(
            "hora_inicio"
        )
    )


def eliminar_por_grupo(grupo_id) -> int:
    """DELETE real de todas las filas con ese `grupo_id`. Devuelve la
    cantidad de filas borradas (0 si el grupo no existía).
    """
    borradas, _ = ReservaSemestral.objects.filter(grupo_id=grupo_id).delete()
    return borradas
