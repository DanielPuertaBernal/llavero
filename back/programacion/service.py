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
- `monitores` necesita `listar_programaciones_por_docente` para
  `clases_del_docente_titular` (portado de `MonitorService.
  clasesDocente()` del legacy, ver AulaSync/analisis/backend/
  monitores.md, diagrama de dependencias: `MonitorService -->
  ProgramacionRepository : findByDocumento`).

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


def _existe_solapamiento_con_reserva_individual_aprobada(
    salon_id, dia: str, hora_inicio, hora_fin, semestre
) -> bool:
    """True si alguna `ReservaIndividual` aprobada, en alguna `fecha`
    dentro del rango del semestre (`semestre.fecha_inicio`..
    `semestre.fecha_fin`, ambos inclusivos) que caiga en el día de la
    semana `dia`, choca en horario con esta franja.

    Pieza de la validación cruzada de RF15 (ver DOC/2. Diseño estratégico/
    2.2 Requerimientos.md: "validar conflictos de horario cruzando las
    tres fuentes... con la misma lógica, sin importar desde cuál de los
    tres flujos se esté creando la reserva").

    El problema de fondo: `Programacion` vive anclada a un `dia` recurrente
    que se repite cada semana durante TODO el semestre (sin `fecha` propia
    de fila), mientras que `reservas.ReservaIndividual` vive anclada a una
    `fecha` puntual concreta. No hay una única fila de `ReservaIndividual`
    contra la que comparar: hay que preguntar por CUALQUIER fecha del
    semestre que caiga en ese día de la semana. Se resuelve trayendo, vía
    `reservas.service.listar_por_salon` (la única pieza ya expuesta por ese
    módulo para consultar por rango de fechas, agregada originalmente para
    `disponibilidad`), TODAS las reservas del salón dentro del rango del
    semestre, filtrando en Python a las que están `aprobada` (mismo
    criterio que `existe_solapamiento_en_salon` de este propio módulo: solo
    una reserva vigente bloquea el horario) y cuyo
    `dia_semana_de_fecha(r.fecha)` coincide con `dia`, y comparando cada
    una con `domain.hay_solapamiento`.

    Import de `reservas.service` DIFERIDO (dentro de la función, no al
    tope del archivo): `reservas.service` importa `programacion.service` a
    nivel de módulo (para su propia validación cruzada simétrica, ver
    docstring de `reservas/service.py`) — un import a nivel de módulo acá
    cerraría un ciclo real `programacion <-> reservas`. Se rompe con este
    import diferido (se ejecuta recién al llamar esta función, momento en
    el que ambos módulos ya están completamente cargados), mismo recurso
    usado en `reservas_semestrales.service._validar_y_crear_franja` para
    el ciclo simétrico `reservas_semestrales <-> reservas`.
    """
    from reservas import service as reservas_service

    candidatas = reservas_service.listar_por_salon(
        salon_id, fecha_desde=semestre.fecha_inicio, fecha_hasta=semestre.fecha_fin
    )
    return any(
        r.estado == "aprobada"
        and domain.dia_semana_de_fecha(r.fecha) == dia
        and domain.hay_solapamiento(hora_inicio, hora_fin, r.hora_inicio, r.hora_fin)
        for r in candidatas
    )


def _existe_solapamiento_con_reserva_semestral(salon_id, dia: str, hora_inicio, hora_fin) -> bool:
    """True si la franja choca con alguna `ReservaSemestral` ya existente
    en ese salón ese día (ambas fuentes son recurrentes con el mismo `dia`,
    así que aquí sí se compara directo, sin necesidad de resolver un rango
    de fechas — a diferencia de `_existe_solapamiento_con_reserva_
    individual_aprobada`).

    Import de `reservas_semestrales.service` DIFERIDO por el mismo motivo
    que en `_existe_solapamiento_con_reserva_individual_aprobada`:
    `reservas_semestrales.service` ya importa `programacion.service` a
    nivel de módulo (ver su propio docstring), así que un import a nivel
    de módulo acá cerraría el ciclo `programacion <-> reservas_
    semestrales`.
    """
    from reservas_semestrales import service as reservas_semestrales_service

    return reservas_semestrales_service.existe_solapamiento_en_salon_semestral(
        salon_id, dia, hora_inicio, hora_fin
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
    referenciados existan, y que la franja horaria no se solape con
    ninguna de las TRES fuentes de horario (RF15): otra clase ya
    programada en el mismo salón el mismo día, una `ReservaSemestral`
    vigente, o una `ReservaIndividual` aprobada en alguna fecha del
    semestre que caiga en ese día de la semana (ver
    `_existe_solapamiento_con_reserva_individual_aprobada` para el detalle
    del cruce recurrente-contra-puntual). Lanza ValueError claro en todos
    los casos, en vez de dejar propagar el IntegrityError crudo de
    Postgres o permitir un choque de horarios silencioso.
    """
    if catalogos_service.obtener_salon(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    if comunidad_service.obtener_persona(docente_id) is None:
        raise ValueError(f"No existe un docente (comunidad) con id {docente_id}")
    semestre = repository.obtener_semestre_por_id(semestre_id)
    if semestre is None:
        raise ValueError(f"No existe un semestre con id {semestre_id}")
    if existe_solapamiento_en_salon(salon_id, dia, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con otra clase ya "
            f"programada en el salón {salon_id} el {dia}"
        )
    if _existe_solapamiento_con_reserva_semestral(salon_id, dia, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con una reserva "
            f"semestral ya existente en el salón {salon_id} el {dia}"
        )
    if _existe_solapamiento_con_reserva_individual_aprobada(
        salon_id, dia, hora_inicio, hora_fin, semestre
    ):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con una reserva "
            f"individual ya aprobada en el salón {salon_id} el {dia}"
        )
    return repository.crear_programacion(
        salon_id, docente_id, semestre_id, dia, hora_inicio, hora_fin, materia
    )


def obtener_programacion(programacion_id):
    """Devuelve la Programacion con ese id, o None si no existe."""
    return repository.obtener_programacion_por_id(programacion_id)


def listar_programaciones_por_docente(docente_id):
    """Todas las clases programadas de ese docente, sin filtrar por
    semestre/día. Pensada para que el futuro `monitores` la consulte vía
    este service (nunca vía `programacion.repository`) al resolver las
    clases del docente titular de una monitoría (ver docstring del
    módulo).
    """
    return repository.listar_programaciones_por_docente(docente_id)
