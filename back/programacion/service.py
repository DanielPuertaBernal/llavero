"""
service.py — API pública del módulo programacion.

Es el ÚNICO punto de entrada que otros módulos (los futuros `reservas`,
`reservas_semestrales`, `llaves`...) deben usar para consumir
programacion — nunca importan `model.py`/`repository.py` de este módulo
directamente. Simétricamente, este módulo consume `catalogos` y
`comunidad` exclusivamente vía `catalogos.service`/`comunidad.service`
(nunca `.model`/`.repository` de esos módulos), la misma regla dura que
ya aplica en `comunidad.service`.

Casos de uso previstos para otros módulos (diseñado pensando en ese
consumo futuro):
- `reservas`/`reservas_semestrales` necesitan `existe_solapamiento_en_salon`
  para validar sus propios horarios contra las clases regulares ya
  programadas en un salón, sin reimplementar la lógica de solapamiento
  (ver docstring de `domain.hay_solapamiento`).
- `reservas_semestrales` necesita `obtener_semestre`/`crear_semestre`
  para validar `semestre_id` al crear una reserva.

Validación de `crear_programacion`: además del patrón ya establecido
(`catalogos.service.crear_salon`, `comunidad.service.crear_persona`) de
validar que las referencias a otras entidades existan antes de dejar
propagar el `IntegrityError` crudo de Postgres, esta función agrega una
validación de negocio real que el legacy no tenía centralizada: que la
nueva franja horaria no se solape con otra clase ya programada en el
mismo salón el mismo día (ver AulaSync/analisis/estrategia-migracion/
backend.md, sección "Deuda técnica que esta migración debe resolver" —
la lógica de solapamiento estaba triplicada y divergente entre
`programacion`/`reservas`/`reservas_semestrales` en el sistema legacy).

Decisión de diseño — NO se valida que `docente_id` sea una `Comunidad`
con `tipo_persona='docente'`: el DDL declara `programacion.docente_id`
como FK genérica a `comunidad(id)`, sin restringir el tipo de persona a
nivel de esquema. Se evaluó agregar esa validación acá (consultando
`comunidad.service.obtener_persona(docente_id).tipo_persona.nombre`
contra el nombre "docente" sembrado por la migración de catalogos), pero
se descartó por tres razones:
1. No está pedida por el DDL ni por ningún requisito de negocio explícito
   para este módulo — sería inventar una regla sin sustento, lo mismo
   que este mismo proyecto evitó en `catalogos`/`configuracion` al no
   replicar validaciones no requeridas del legacy.
2. `catalogos.service` no expone (deliberadamente) un
   `obtener_tipo_persona_por_nombre` público — solo `obtener_tipo_persona
   (id)` — así que validar esto acoplaría `programacion` al string
   literal "docente" sembrado por una migración de otro módulo, en vez
   de a un contrato explícito de esa API pública.
3. Es fácil de agregar después (una línea en `crear_programacion`) si en
   el futuro aparece un requisito real que lo pida; no agregarla ahora no
   cierra esa puerta.
Si esta decisión resulta incorrecta a la luz de un requisito de negocio
concreto, el punto de extensión es este mismo método.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT de una sola tabla, ya atómico de por sí en
Django (autocommit por sentencia).
"""

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import domain, repository

# ------------------------------------------------------------------
# Semestre
# ------------------------------------------------------------------


def listar_semestres():
    return repository.listar_semestres()


def crear_semestre(codigo: str, fecha_inicio, fecha_fin):
    return repository.crear_semestre(codigo, fecha_inicio, fecha_fin)


def obtener_semestre(semestre_id):
    """Devuelve el Semestre con ese id, o None si no existe."""
    return repository.obtener_semestre_por_id(semestre_id)


# ------------------------------------------------------------------
# Programacion
# ------------------------------------------------------------------


def listar_programaciones():
    return repository.listar_programaciones()


def listar_programaciones_por_salon_y_dia(salon_id, dia: str):
    """Consulta reutilizable: expone las clases ya programadas en un
    salón un día dado. Pensada para que los futuros `reservas`/
    `reservas_semestrales` la consulten (vía este service, nunca vía
    `programacion.repository`) al validar sus propios conflictos.
    """
    return repository.listar_programaciones_por_salon_y_dia(salon_id, dia)


def existe_solapamiento_en_salon(salon_id, dia: str, hora_inicio, hora_fin) -> bool:
    """True si la franja [hora_inicio, hora_fin) choca con alguna clase ya
    programada en ese salón ese día.

    Pieza reutilizable pensada explícitamente para que los futuros
    módulos `reservas`/`reservas_semestrales` la consulten vía
    `programacion.service` al validar sus propios horarios contra las
    clases regulares, en vez de reimplementar la comparación de franjas
    (ver docstring del módulo).
    """
    existentes = repository.listar_programaciones_por_salon_y_dia(salon_id, dia)
    return any(
        domain.hay_solapamiento(hora_inicio, hora_fin, p.hora_inicio, p.hora_fin)
        for p in existentes
    )


def crear_programacion(
    salon_id,
    docente_id,
    semestre_id,
    dia: str,
    hora_inicio,
    hora_fin,
    materia: str,
):
    """Crea una Programacion validando primero que salon/docente/semestre
    referenciados existan, y que la franja horaria no se solape con otra
    clase ya programada en el mismo salón el mismo día. Lanza ValueError
    claro en ambos casos, en vez de dejar propagar el IntegrityError crudo
    de Postgres o permitir un choque de horarios silencioso.
    """
    if catalogos_service.obtener_salon(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    if comunidad_service.obtener_persona(docente_id) is None:
        raise ValueError(f"No existe un docente (comunidad) con id {docente_id}")
    if repository.obtener_semestre_por_id(semestre_id) is None:
        raise ValueError(f"No existe un semestre con id {semestre_id}")
    if existe_solapamiento_en_salon(salon_id, dia, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con otra clase ya "
            f"programada en el salón {salon_id} el {dia}"
        )
    return repository.crear_programacion(
        salon_id, docente_id, semestre_id, dia, hora_inicio, hora_fin, materia
    )


def obtener_programacion(programacion_id):
    """Devuelve la Programacion con ese id, o None si no existe."""
    return repository.obtener_programacion_por_id(programacion_id)
