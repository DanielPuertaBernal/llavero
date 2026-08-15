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

Decisión de diseño — `docente_id` es opcional (`None` es un valor válido,
ver `model.Programacion.docente` con `null=True`): una clase puede
quedar registrada con salón/día/horario confirmados pero sin docente
todavía asignado (ver docstring de `model.py` para el caso de negocio
real — Excel con filas de docente pendiente de confirmar). Cuando
`docente_id` es `None` se salta por completo la validación de que exista
en `comunidad` (no hay nada que validar); cuando SÍ viene un valor, se
valida igual que siempre. Nota de implementación de firma: `docente_id`
(y el resto de parámetros de `crear_programacion`) tienen `=None` como
default no porque sean opcionales de negocio (salvo `docente_id`, todos
los demás siguen siendo obligatorios para crear una fila válida — pasar
`None` en `semestre_id`/`dia`/etc. simplemente cae en el mismo
`ValueError` de "no existe"/de solapamiento de siempre), sino para poder
darle a `docente_id` un default sin reordenar la firma posicional ya
consumida por controller.py, excel_import y una docena de tests de otros
módulos (`monitores`, `reservas`, `disponibilidad`, `nfc`,
`reservas_semestrales`) que la llaman posicionalmente — reordenar
`docente_id` al final habría forzado tocar todos esos módulos ajenos
solo para un cambio de nulabilidad de este módulo.

Decisión de diseño — NO se valida que `docente_id` (cuando no es `None`)
sea una `Comunidad` con `tipo_persona='docente'`: el DDL declara
`programacion.docente_id` como FK genérica a `comunidad(id)`, sin
restringir el tipo de persona a nivel de esquema. Se evaluó agregar esa
validación acá (consultando
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
from programacion import domain, excel_import, repository

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


def obtener_o_crear_semestre(codigo: str, fecha_inicio, fecha_fin):
    """Upsert idempotente por `codigo` (la clave natural/UNIQUE del DDL,
    ver `model.Semestre.codigo`): si ya existe un Semestre con ese código,
    lo devuelve tal cual (NO sobrescribe sus fechas) — si no existe, lo
    crea con las fechas dadas.

    Pensada específicamente para que un mismo archivo de programación se
    pueda volver a cargar sin que la segunda carga falle por
    `IntegrityError` de `codigo` UNIQUE (ver `importar_programacion_
    desde_excel`, que la usa para resolver el semestre detectado en el
    Excel). No actualizar las fechas en el caso "ya existe" es deliberado:
    si el semestre ya fue creado (por este import o por el endpoint manual
    `POST /programacion/semestres`), un reimport del mismo archivo no debe
    poder correr sus fechas por detrás sin que quien reimporta lo pida
    explícitamente — hay un endpoint dedicado para eso si se necesita en
    el futuro.
    """
    existente = repository.obtener_semestre_por_codigo(codigo)
    if existente is not None:
        return existente
    return repository.crear_semestre(codigo, fecha_inicio, fecha_fin)


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
    docente_id=None,
    semestre_id=None,
    dia: str = None,
    hora_inicio=None,
    hora_fin=None,
    materia: str = None,
):
    """Crea una Programacion validando primero que salon/semestre
    referenciados existan (y `docente`, solo si `docente_id` no es
    `None` — ver "Decisión de diseño — `docente_id` es opcional" en el
    docstring del módulo), y que la franja horaria no se solape con
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
    if docente_id is not None and comunidad_service.obtener_persona(docente_id) is None:
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


# ------------------------------------------------------------------
# Carga masiva desde Excel
# ------------------------------------------------------------------


def _construir_mapa_salones() -> dict[str, object]:
    """Arma un mapa `nombre en minúsculas -> id de Salon` a partir de
    `catalogos.service.listar_salones()` (la única API pública que
    `catalogos` expone para esto; `programacion` no puede tocar
    `catalogos.repository`/`.model` — regla dura del proyecto). No existe
    un lookup por nombre en `catalogos.service`, así que se resuelve acá,
    en memoria, sobre el listado completo (número de salones del campus es
    chico, un `listar_salones()` completo por import es aceptable).

    Ojo con la unicidad: el DDL solo garantiza `nombre` único DENTRO de un
    mismo `bloque` (`uq_salon_nombre_bloque`, ver `catalogos.service.
    crear_salon`) — dos bloques distintos pueden tener cada uno su salón
    "101". Si el nombre del Excel (que no trae información de bloque)
    coincide con más de un salón, ese nombre queda deliberadamente FUERA
    del mapa (no se puede resolver una ambigüedad con la información
    disponible en el archivo) y las filas que lo referencien se reportan
    como omitidas con un motivo explícito, en vez de asignar el salón
    equivocado a ciegas.
    """
    por_nombre: dict[str, list] = {}
    for salon in catalogos_service.listar_salones():
        por_nombre.setdefault(salon.nombre.strip().lower(), []).append(salon.id)
    return {nombre: ids[0] for nombre, ids in por_nombre.items() if len(ids) == 1}


def importar_programacion_desde_excel(
    archivo_bytes: bytes,
    semestre_fecha_inicio=None,
    semestre_fecha_fin=None,
):
    """Carga masiva de `Programacion` desde un archivo `.xlsx` (RF "cargar
    programación desde Excel"). Formato de columnas esperado y su mapeo
    flexible de nombres: ver docstring de `programacion.excel_import`
    (referencia de negocio: AulaSync `programacion.service.js#
    importarDesdeExcel`, sin copiar su código).

    Decisión de diseño — fechas del semestre: el Excel real de AulaSync
    trae sus propias columnas `fecha_inicio`/`fecha_fin` (ver
    `excel_import.extraer_fechas_semestre`), así que esta función las
    extrae del ARCHIVO primero — el Excel es la fuente de verdad. Los
    parámetros `semestre_fecha_inicio`/`semestre_fecha_fin` (antes
    obligatorios, tipeados a mano en el formulario de carga) ahora son
    OPCIONALES: quedan como fallback manual, usado únicamente cuando el
    archivo de verdad no trae esas columnas (`extraer_fechas_semestre`
    devuelve `None`). Se optó por mantenerlos como fallback en vez de
    eliminarlos por completo porque no todo Excel de programación real
    va a traer siempre esas columnas (algunos sistemas de origen no las
    incluyen) y exigirlas sin excepción rompería la carga de esos
    archivos sin ninguna vía de recuperación. Si NINGUNA de las dos
    fuentes (archivo o parámetro manual) trae fecha, se lanza el mismo
    `ValueError` de nivel de archivo que AulaSync lanza en ese caso.

    Decisión de diseño central — se reutiliza `crear_programacion` FILA
    POR FILA en vez de insertar el lote directo contra el repository: es
    la única forma de preservar, para cada fila importada, la validación
    cruzada de solapamiento de horario de RF15 (tres fuentes: otra clase
    ya programada, `ReservaSemestral`, `ReservaIndividual` aprobada — ver
    docstring de `crear_programacion`). Un `bulk_create` directo contra
    `repository` saltaría esa garantía por completo para todo un archivo
    de golpe, exactamente la clase de deuda técnica (validación de
    solapamiento no aplicada de forma consistente) que este proyecto ya
    decidió resolver de una vez por todas en `programacion.service` (ver
    docstring del módulo). El costo es N validaciones/INSERTs en vez de
    uno solo — aceptable: un archivo de programación de un semestre no
    tiene un volumen de filas que lo haga prohibitivo, y la alternativa
    (perder la garantía) no es negociable.

    Ninguna fila mala (aula desconocida/ambigua, docente desconocido,
    horario/día mal formado, o un `ValueError` de solapamiento que
    `crear_programacion` ya lanza) aborta el archivo completo: se captura
    por fila y se reporta en `omitidas`, nunca se deja propagar como un
    500. Esto también es lo que hace seguro reimportar el mismo archivo
    dos veces: la segunda vez, cada fila ya creada choca contra sí misma
    (mismo salón/día/horario) y `crear_programacion` la rechaza con el
    mismo `ValueError` de solapamiento de siempre — que acá se traduce en
    una fila omitida con motivo, no en una excepción sin manejar.

    Resolución de docente — decisión de diseño: se usa `comunidad.service.
    obtener_por_documento` (solo lectura), NO `crear_o_actualizar_por_
    documento`. Ese upsert exige `tipo_persona_id` (ver su firma en
    `comunidad/service.py`), un dato que el Excel de programación NO trae
    (las columnas de referencia — `nroidenti`/`numero_documento`, `dia`,
    `horario`, `aula`, `materia`, `semestre` — no incluyen tipo de
    persona). Adivinar un `tipo_persona_id` (p. ej. buscando uno llamado
    "docente" por convención) acoplaría este import a un string sembrado
    por la migración de `catalogos`, el mismo atajo que `crear_programacion`
    ya decidió NO tomar para su propia validación de docente (ver su
    docstring).

    Cambio de comportamiento (docente ya NO es motivo de omisión, ver
    `model.Programacion.docente` con `null=True`): una fila sin número de
    documento, o cuyo número de documento no resuelve a ninguna persona
    existente en `comunidad`, YA NO se omite — se importa igual con
    `docente_id=None` (mismo criterio que AulaSync: "si tiene salón pero
    sin docente asignado, se incluye"). Solo se sigue omitiendo una fila
    por datos genuinamente irresolubles: aula desconocida/ambigua, día u
    horario mal formado, código de semestre inconsistente, o un
    `ValueError` de solapamiento de `crear_programacion`. El conteo de
    filas creadas SIN docente se reporta aparte en `creadas_sin_docente`
    (informativo, no es una omisión/falla) para que quien importe sepa
    cuántas clases quedaron pendientes de asignar docente manualmente.

    Devuelve un resumen:
    `{"creadas": int, "creadas_sin_docente": int,
    "omitidas": [{"fila": int, "motivo": str}, ...], "semestre": Semestre}`.
    """
    filas = excel_import.leer_filas(archivo_bytes)

    fechas_excel = excel_import.extraer_fechas_semestre(filas)
    if fechas_excel is not None:
        fecha_inicio_semestre, fecha_fin_semestre = fechas_excel
    elif semestre_fecha_inicio is not None and semestre_fecha_fin is not None:
        fecha_inicio_semestre, fecha_fin_semestre = semestre_fecha_inicio, semestre_fecha_fin
    else:
        raise ValueError(
            "No se encontraron fechas de inicio o fin del semestre en el "
            'Excel. Verifique las columnas "fecha_inicio" y "fecha_fin".'
        )

    mapa_salones = _construir_mapa_salones()
    cache_docentes: dict[str, object] = {}

    creadas = 0
    creadas_sin_docente = 0
    omitidas: list[dict] = []
    semestre = None

    for numero_fila, fila in filas:
        try:
            if semestre is None:
                if "semestre" not in fila:
                    omitidas.append(
                        {"fila": numero_fila, "motivo": "fila sin código de semestre"}
                    )
                    continue
                codigo_semestre = excel_import.normalizar_codigo_semestre(fila["semestre"])
                semestre = obtener_o_crear_semestre(
                    codigo_semestre, fecha_inicio_semestre, fecha_fin_semestre
                )
            elif "semestre" in fila:
                codigo_fila = excel_import.normalizar_codigo_semestre(fila["semestre"])
                if codigo_fila != semestre.codigo:
                    omitidas.append(
                        {
                            "fila": numero_fila,
                            "motivo": (
                                f'código de semestre "{codigo_fila}" distinto al '
                                f'detectado en el archivo ("{semestre.codigo}")'
                            ),
                        }
                    )
                    continue

            aula = str(fila.get("aula", "")).strip()
            if not aula:
                omitidas.append({"fila": numero_fila, "motivo": "fila sin aula"})
                continue
            salon_id = mapa_salones.get(aula.lower())
            if salon_id is None:
                omitidas.append(
                    {"fila": numero_fila, "motivo": f'aula desconocida o ambigua: "{aula}"'}
                )
                continue

            materia = str(fila.get("materia", "")).strip()
            if not materia:
                omitidas.append({"fila": numero_fila, "motivo": "fila sin materia"})
                continue

            dia = excel_import.normalizar_dia(fila.get("dia", ""))
            hora_inicio, hora_fin = excel_import.normalizar_horario(fila)

            numero_documento = str(fila.get("numero_documento", "")).strip()
            docente_id = None
            if numero_documento:
                if numero_documento not in cache_docentes:
                    cache_docentes[numero_documento] = comunidad_service.obtener_por_documento(
                        numero_documento
                    )
                docente = cache_docentes[numero_documento]
                if docente is not None:
                    docente_id = docente.id
                # docente is None (numero_documento no resuelve a nadie en
                # comunidad): docente_id se queda en None, la fila NO se
                # omite (ver docstring, cambio de comportamiento).

            crear_programacion(
                salon_id, docente_id, semestre.id, dia, hora_inicio, hora_fin, materia
            )
            creadas += 1
            if docente_id is None:
                creadas_sin_docente += 1
        except ValueError as exc:
            omitidas.append({"fila": numero_fila, "motivo": str(exc)})

    if semestre is None:
        raise ValueError(
            "No se pudo determinar el semestre del archivo: ninguna fila trae "
            "un código de semestre válido en la columna \"semestre\""
        )

    return {
        "creadas": creadas,
        "creadas_sin_docente": creadas_sin_docente,
        "omitidas": omitidas,
        "semestre": semestre,
    }
