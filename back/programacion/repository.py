"""
repository.py — única capa del módulo programacion que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para las 2
entidades que este módulo posee: semestre, programacion.

`listar_programaciones_por_salon_y_dia` es la consulta que `service.py`
cruza contra `domain.hay_solapamiento` antes de crear una nueva
programación (y la misma que los futuros módulos `reservas`/
`reservas_semestrales` necesitarán consultar vía `programacion.service`
para validar sus propios conflictos de horario contra clases regulares).
"""

from programacion.model import Programacion, Semestre

# ------------------------------------------------------------------
# Semestre
# ------------------------------------------------------------------


def listar_semestres():
    return list(Semestre.objects.order_by("codigo"))


def crear_semestre(codigo: str, fecha_inicio, fecha_fin) -> Semestre:
    return Semestre.objects.create(
        codigo=codigo, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
    )


def obtener_semestre_por_id(semestre_id):
    return Semestre.objects.filter(id=semestre_id).first()


def obtener_semestre_por_codigo(codigo: str):
    return Semestre.objects.filter(codigo=codigo).first()


# ------------------------------------------------------------------
# Programacion
# ------------------------------------------------------------------


def listar_programaciones():
    return list(Programacion.objects.order_by("dia", "hora_inicio"))


def crear_programacion(
    salon_id,
    docente_id,
    semestre_id,
    dia: str,
    hora_inicio,
    hora_fin,
    materia: str,
) -> Programacion:
    return Programacion.objects.create(
        salon_id=salon_id,
        docente_id=docente_id,
        semestre_id=semestre_id,
        dia=dia,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        materia=materia,
    )


def obtener_programacion_por_id(programacion_id):
    return Programacion.objects.filter(id=programacion_id).first()


def listar_programaciones_por_salon_y_dia(salon_id, dia: str):
    return list(
        Programacion.objects.filter(salon_id=salon_id, dia=dia).order_by("hora_inicio")
    )


def listar_programaciones_por_docente(docente_id):
    return list(
        Programacion.objects.filter(docente_id=docente_id).order_by("dia", "hora_inicio")
    )
