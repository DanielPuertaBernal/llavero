"""
service.py — API pública del módulo reservas.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
reservas — nunca importan `model.py`/`repository.py` de este módulo
directamente. Simétricamente, este módulo consume `catalogos`/`comunidad`
exclusivamente vía su `.service` respectivo (nunca `.model`/`.repository`
de esos módulos), la misma regla dura ya aplicada en
`programacion.service`/`llaves.service`.

Nota de diseño — integración `llaves` -> `reservas` (dependencia
UNIDIRECCIONAL acordada explícitamente para esta tarea, ver la nota de
diseño completa en `llaves/service.py` y en `reservas/model.py`):
`llaves.service.crear_llave` importa y llama a `obtener_reserva`/
`completar_reserva` de este service cuando se entrega una llave con
`origen='reserva_individual'` asociada a una reserva concreta. Este módulo
expone esas dos funciones pensando explícitamente en ese consumidor, pero
NUNCA importa nada de `llaves` (ni `.service` ni `.model`) — esa dirección
de import cerraría el ciclo `llaves<->reservas` que el proyecto evita
deliberadamente. Si algún día `reservas` pareciera necesitar saber algo de
`llaves` (p. ej. "¿esta reserva ya tiene una llave entregada?"), la
solución correcta es que `llaves` se lo pase como parámetro explícito a
una función de este service, nunca agregar el import inverso.

Convención de esta API, igual que el resto de módulos:
- `obtener_reserva`/`listar_*` no lanzan excepción ante "no existe"/"sin
  resultados": devuelven `None`/lista vacía.
- `crear_reserva` lanza `ValueError` cuando la franja viola
  `hora_inicio < hora_fin`, cuando `salon_id`/`solicitante_id` no existen,
  cuando la franja se solapa con otra reserva ya `aprobada` para el mismo
  salón/fecha (`domain.hay_solapamiento`), o cuando se solapa con una
  `Programacion`/`ReservaSemestral` recurrente vigente para el día de la
  semana que le corresponde a `fecha` (RF15, validación cruzada — ver
  docstring de `crear_reserva`). Mismo patrón que
  `programacion.service.crear_programacion` y
  `reservas_semestrales.service.crear_grupo_reservas_semestrales`, que
  también validan cruzado contra las otras dos fuentes.

Nota de diseño — imports de `programacion.service`/`reservas_semestrales.
service` a nivel de módulo (arriba): a diferencia de
`programacion.service`/`reservas_semestrales.service` (que importan
`reservas.service` de forma DIFERIDA, dentro de la función que lo usa, ver
sus propios docstrings), este módulo sí puede importarlos al tope del
archivo sin cerrar ningún ciclo — ninguno de los dos importa
`reservas.service` a nivel de módulo. Los tres módulos necesitan
conocerse mutuamente (RF15 exige que cada uno valide cruzado contra los
otros dos), lo que en un grafo de imports puramente a nivel de módulo
sería un ciclo de 3 nodos sin solución; se rompe designando a `reservas`
como el único de los tres que importa a los otros dos arriba, y a
`programacion`/`reservas_semestrales` como los que resuelven su import de
`reservas` en tiempo de llamada.

Nota de diseño — `hora_inicio < hora_fin` se valida en `service.py`, NO en
`domain.py`: es una comparación de dos parámetros contra sí mismos, sin
ninguna regla de negocio que documentar aparte (a diferencia de
`hay_solapamiento`, cuyo criterio de franjas adyacentes sí merece una
función pura nombrada y sus propios tests). Mismo criterio ya aplicado en
`reservas_semestrales.service._validar_y_crear_franja`, el único otro
módulo que valida esta misma regla: su `domain.py` tampoco expone un
predicado para ella. La regla sigue además replicada como CHECK
`ck_reserva_individual_horario_valido` en el DDL (ver `model.py`), que
queda como última línea de defensa — el service existe para que el cliente
reciba un 400 con `detail` en vez del 500 de un IntegrityError crudo.
- `cancelar_reserva`/`completar_reserva` transicionan el estado. A
  diferencia de `novedades.service.cerrar_novedad`/`llaves.service.
  devolver_llave` (que devuelven `None` si el id no existe), estas dos
  funciones lanzan `ValueError` también cuando la reserva no existe — ver
  nota de diseño puntual en cada una para el porqué.

Nota de diseño — `marcar_no_reclamada` (transición automática por tiempo,
`domain.es_no_reclamada`, ver ese módulo — antes documentada como
"mecanismo no especificado", ya resuelta en `sdd/scheduler-transiciones`):
lanza `ValueError` si la reserva no existe (mismo criterio que
`cancelar_reserva`/`completar_reserva`: el único caller previsto es el
futuro `scheduler` recorriendo una lista de reservas `aprobada` que él
mismo acaba de consultar vía `listar_reservas_aprobadas_hasta`), y es un
no-op silencioso (sin error) si la reserva ya está en `'no_reclamada'`,
`'completada'` o `'cancelada'` — la transición solo tiene sentido una vez,
desde `'aprobada'`. Reusa `repository.cambiar_estado` (no hay función de
repository dedicada, misma forma que `cancelar_reserva`/
`completar_reserva`).

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT/UPDATE de una sola tabla, ya atómico de por
sí en Django (autocommit por sentencia).
"""

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import service as programacion_service
from reservas import domain, repository
from reservas.model import EstadoReservaIndividual
from reservas_semestrales import service as reservas_semestrales_service


def listar_reservas():
    return repository.listar_reservas()


def existe_solapamiento_en_salon(salon_id, fecha, hora_inicio, hora_fin) -> bool:
    """True si la franja [hora_inicio, hora_fin) choca con alguna reserva
    ya `aprobada` para ese salón esa fecha.

    Una reserva `cancelada`/`completada`/`no_reclamada` NO bloquea el
    horario (ver docstring del módulo) — solo `aprobada` representa una
    ocupación real y vigente del salón.
    """
    existentes = repository.listar_por_salon_y_fecha_aprobadas(salon_id, fecha)
    return any(
        domain.hay_solapamiento(hora_inicio, hora_fin, r.hora_inicio, r.hora_fin)
        for r in existentes
    )


def crear_reserva(
    salon_id,
    solicitante_id,
    fecha,
    hora_inicio,
    hora_fin,
    motivo: str | None = None,
):
    """Crea una ReservaIndividual validando que la franja horaria sea
    válida (`hora_inicio < hora_fin`), que `salon_id`/`solicitante_id`
    referenciados existan, y que la franja no se solape con NINGUNA de las
    TRES fuentes de horario (RF15): otra reserva ya `aprobada` en el mismo
    salón la misma fecha, una `Programacion` cuyo `dia` recurrente coincida
    con el día de la semana de `fecha`, o una `ReservaSemestral` en las
    mismas condiciones. Lanza ValueError claro en todos los casos, en vez
    de dejar propagar el IntegrityError crudo de Postgres o permitir un
    choque de horarios silencioso.

    El problema de fondo (cruce puntual-contra-recurrente, ver RF15 en
    DOC/2. Diseño estratégico/2.2 Requerimientos.md): esta reserva vive
    anclada a una `fecha` puntual concreta, mientras que `Programacion`/
    `ReservaSemestral` viven ancladas a un `dia` recurrente que se repite
    cada semana durante todo el semestre (sin `fecha` propia). A diferencia
    del cruce inverso (`programacion.service._existe_solapamiento_con_
    reserva_individual_aprobada`, que necesita resolver el rango de fechas
    de un semestre para saber qué fechas puntuales mirar), acá el cruce es
    directo: solo hace falta convertir la ÚNICA `fecha` de esta reserva al
    `dia` recurrente que le corresponde (`domain.dia_semana_de_fecha`) y
    preguntarles a `programacion.service.existe_solapamiento_en_salon`/
    `reservas_semestrales.service.existe_solapamiento_en_salon_semestral`
    (las piezas reutilizables que esos módulos ya exponen para este
    propósito) si alguna de sus filas choca en ese salón/día/horario — sin
    necesidad de resolver ningún semestre ni rango de fechas acá.

    La franja se valida PRIMERO, antes que las referencias y los
    solapamientos: es la única de las comprobaciones que es pura (no
    consulta la base de datos), así que descartar acá un request
    imposible evita varias consultas inútiles. Mismo orden que
    `reservas_semestrales.service._validar_y_crear_franja`, que también
    valida la franja antes de cualquier consulta de solapamiento.

    Nace siempre en estado 'aprobada' (default del DDL, ver model.py): no
    hay parámetro `estado` acá.
    """
    if hora_inicio >= hora_fin:
        raise ValueError(
            f"hora_inicio ({hora_inicio}) debe ser anterior a hora_fin ({hora_fin})"
        )
    if catalogos_service.obtener_salon(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    if comunidad_service.obtener_persona(solicitante_id) is None:
        raise ValueError(f"No existe un solicitante (comunidad) con id {solicitante_id}")
    if existe_solapamiento_en_salon(salon_id, fecha, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con otra reserva ya "
            f"aprobada en el salón {salon_id} el {fecha}"
        )
    dia = domain.dia_semana_de_fecha(fecha)
    if programacion_service.existe_solapamiento_en_salon(salon_id, dia, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con una clase ya "
            f"programada en el salón {salon_id} el {dia} ({fecha})"
        )
    if reservas_semestrales_service.existe_solapamiento_en_salon_semestral(
        salon_id, dia, hora_inicio, hora_fin
    ):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con una reserva "
            f"semestral ya existente en el salón {salon_id} el {dia} ({fecha})"
        )
    return repository.crear_reserva(
        salon_id, solicitante_id, fecha, hora_inicio, hora_fin, motivo=motivo
    )


def obtener_reserva(reserva_id):
    """Devuelve la ReservaIndividual con ese id, o None si no existe.

    Consulta principal del consumidor cross-módulo `llaves.service.
    crear_llave` (ver Nota de diseño del módulo): valida ahí que la
    reserva exista y esté 'aprobada' ANTES de crear la llave, así que esta
    función sigue la convención estándar `obtener_*` (devuelve None, no
    lanza) — es `completar_reserva` la que lanza ValueError, una vez que
    el caller ya decidió proceder.
    """
    return repository.obtener_por_id(reserva_id)


def listar_reservas_por_solicitante(solicitante_id):
    return repository.listar_por_solicitante(solicitante_id)


def listar_reservas_por_estado(estado):
    return repository.listar_por_estado(estado)


def cancelar_reserva(reserva_id):
    """Cancela la reserva (estado -> 'cancelada'): la única transición que
    un caller externo puede pedir de forma explícita fuera del flujo de
    `llaves` (ver docstring del módulo — `no_reclamada` no tiene
    disparador especificado, y `completada` solo la dispara `llaves`).

    Lanza ValueError si la reserva no existe, o si no está en 'aprobada'
    (no se puede cancelar una reserva ya cancelada/completada/
    no_reclamada).
    """
    reserva = repository.obtener_por_id(reserva_id)
    if reserva is None:
        raise ValueError(f"No existe una reserva con id {reserva_id}")
    if reserva.estado != EstadoReservaIndividual.APROBADA:
        raise ValueError(
            f"No se puede cancelar una reserva en estado '{reserva.estado}' "
            "(solo se puede cancelar una reserva 'aprobada')"
        )
    return repository.cambiar_estado(reserva_id, EstadoReservaIndividual.CANCELADA)


def completar_reserva(reserva_id):
    """Completa la reserva (estado -> 'completada').

    Pensada para que `llaves.service.crear_llave` la invoque justo después
    de crear con éxito una llave con `origen='reserva_individual'`
    asociada (ver Nota de diseño del módulo) — el "check-in" físico de la
    reserva. No se expone vía HTTP en `controller.py`: a diferencia de
    `cancelar_reserva`, esta transición nunca la pide un caller humano
    directamente, siempre es un efecto secundario de entregar la llave.

    Lanza ValueError si la reserva no existe, o si no está en 'aprobada'
    (no se puede completar una reserva ya cancelada/completada/
    no_reclamada) — mismo contrato que `cancelar_reserva`, deliberadamente
    simétrico aunque `llaves.service` ya valida existencia+estado antes de
    llamar acá vía `obtener_reserva`: mantener el mismo contrato en las dos
    funciones de transición evita que un futuro segundo consumidor directo
    de `completar_reserva` reciba un comportamiento distinto sin motivo.
    """
    reserva = repository.obtener_por_id(reserva_id)
    if reserva is None:
        raise ValueError(f"No existe una reserva con id {reserva_id}")
    if reserva.estado != EstadoReservaIndividual.APROBADA:
        raise ValueError(
            f"No se puede completar una reserva en estado '{reserva.estado}' "
            "(solo se puede completar una reserva 'aprobada')"
        )
    return repository.cambiar_estado(reserva_id, EstadoReservaIndividual.COMPLETADA)


def marcar_no_reclamada(reserva_id):
    """Marca la ReservaIndividual con ese id en 'no_reclamada' (transición
    automática por tiempo, ver Nota de diseño del módulo).

    Lanza ValueError si la reserva no existe. Es un no-op (no lanza, no
    cambia nada) si la reserva ya está en 'no_reclamada', 'completada' o
    'cancelada': solo transiciona desde 'aprobada'.
    """
    reserva = repository.obtener_por_id(reserva_id)
    if reserva is None:
        raise ValueError(f"No existe una reserva con id {reserva_id}")
    if reserva.estado != EstadoReservaIndividual.APROBADA:
        return reserva
    return repository.cambiar_estado(reserva_id, EstadoReservaIndividual.NO_RECLAMADA)


def listar_por_salon(salon_id, fecha_desde=None, fecha_hasta=None):
    """Todas las reservas de `salon_id`, sin filtrar por `estado` ni por
    fecha (a menos que se pase `fecha_desde`/`fecha_hasta`, ambos
    inclusivos) — agregada para el consumo del futuro módulo
    `disponibilidad` (RF14: vista de calendario que superpone `Programacion`
    + `ReservaSemestral` + `ReservaIndividual`), que necesita ver el dato
    crudo de todas las reservas de un salón, incluidas las
    `cancelada`/`completada`/`no_reclamada` (a diferencia de
    `existe_solapamiento_en_salon`, que sí filtra a `aprobada` porque esa sí
    es una pregunta de negocio distinta: "¿hay algo que choque con esto
    ahora mismo?"). Mismo criterio de extensión aditiva ya aplicado en
    `reservas_semestrales.service.listar_por_solicitante`/
    `programacion.service.listar_programaciones_por_docente` cuando un
    nuevo consumidor cross-módulo necesitó una consulta que no estaba
    expuesta todavía."""
    return repository.listar_por_salon(salon_id, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)


def listar_reservas_aprobadas_hasta(fecha):
    """Reservas 'aprobada' con fecha <= `fecha` — candidatas del futuro
    scheduler (ver Nota de diseño del módulo y `repository.
    listar_aprobadas_hasta`)."""
    return repository.listar_aprobadas_hasta(fecha)
