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
- `crear_reserva` lanza `ValueError` cuando `salon_id`/`solicitante_id` no
  existen, o cuando la franja se solapa con otra reserva ya `aprobada`
  para el mismo salón/fecha (`domain.hay_solapamiento`), mismo patrón que
  `programacion.service.crear_programacion` con clases regulares.
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
from reservas import domain, repository
from reservas.model import EstadoReservaIndividual


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
    """Crea una ReservaIndividual validando primero que `salon_id`/
    `solicitante_id` referenciados existan, y que la franja horaria no se
    solape con otra reserva ya `aprobada` en el mismo salón la misma
    fecha. Lanza ValueError claro en ambos casos, en vez de dejar
    propagar el IntegrityError crudo de Postgres o permitir un choque de
    horarios silencioso.

    Nace siempre en estado 'aprobada' (default del DDL, ver model.py): no
    hay parámetro `estado` acá.
    """
    if catalogos_service.obtener_salon(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    if comunidad_service.obtener_persona(solicitante_id) is None:
        raise ValueError(f"No existe un solicitante (comunidad) con id {solicitante_id}")
    if existe_solapamiento_en_salon(salon_id, fecha, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} se solapa con otra reserva ya "
            f"aprobada en el salón {salon_id} el {fecha}"
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


def listar_reservas_aprobadas_hasta(fecha):
    """Reservas 'aprobada' con fecha <= `fecha` — candidatas del futuro
    scheduler (ver Nota de diseño del módulo y `repository.
    listar_aprobadas_hasta`)."""
    return repository.listar_aprobadas_hasta(fecha)
