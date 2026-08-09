"""
service.py — API pública del módulo reservas_semestrales.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
reservas_semestrales — nunca importan `model.py`/`repository.py` de este
módulo directamente. Simétricamente, este módulo consume
`catalogos`/`comunidad`/`programacion` exclusivamente vía su `.service`
respectivo (nunca `.model`/`.repository` de esos módulos), la misma regla
dura ya aplicada en `reservas.service`.

Caso de uso real (ver contexto de negocio): una sola "solicitud" (p. ej. un
semillero que pide salón todos los lunes y miércoles de 8 a 10) puede
reservar varias franjas día/hora a la vez. Todas esas filas comparten un
`grupo_id` generado UNA sola vez, para poder cancelarlas juntas después.
`crear_grupo_reservas_semestrales` es la función que modela ese caso de
uso; `crear_reserva_semestral` es un atajo de una sola franja (pensado para
tests/consumidores simples) que delega en la de grupo con una lista de un
elemento — no hay dos caminos de validación distintos.

Nota de diseño — `transaction.atomic()` SÍ se usa en
`crear_grupo_reservas_semestrales`, a diferencia del resto de módulos del
proyecto (ver "No se usa `transaction.atomic()`..." en
`reservas.service`/`programacion.service`/etc.): esos módulos no lo
necesitan porque cada operación de escritura es un único INSERT de una
sola tabla, ya atómico de por sí en Django (autocommit por sentencia).
Este caso es distinto: una solicitud crea VARIAS filas (una por franja) que
deben persistirse todo-o-nada — si la franja 3 de 5 falla su validación,
las 2 ya creadas dentro de la misma llamada deben revertirse, no quedar
huérfanas con un `grupo_id` a medio poblar. `transaction.atomic()` es la
única forma de garantizar eso.

Nota de diseño — el solapamiento entre franjas de la MISMA solicitud (p.
ej. si el payload pide dos franjas que chocan entre sí) también queda
cubierto sin lógica adicional: `crear_grupo_reservas_semestrales` valida y
crea una franja a la vez, dentro de la misma transacción; para cuando se
valida la franja N, las franjas 1..N-1 ya fueron persistidas (aunque no
confirmadas/commiteadas todavía) y por tanto ya son visibles para la
consulta `listar_por_salon_y_dia` que hace
`existe_solapamiento_en_salon_semestral` (lecturas dentro de la misma
transacción de Postgres ven las escrituras propias no confirmadas). No
hace falta una validación cruzada explícita entre elementos de la lista.

Nota de diseño — validación de cada franja: FKs (`salon_id`/
`solicitante_id`/`semestre_id`) se validan UNA vez por grupo (son
compartidas por todas las franjas de la solicitud, no por franja). El CHECK
`hora_inicio < hora_fin` y ambos solapamientos (contra otras
`reserva_semestral`, y contra `Programacion`) se validan POR franja.

Nota de diseño — no-solapamiento contra `Programacion`: se usa
`programacion.service.existe_solapamiento_en_salon`, diseñada
explícitamente para este caso de uso (ver su propio docstring: "reservas/
reservas_semestrales necesitan existe_solapamiento_en_salon para validar
sus propios horarios contra las clases regulares ya programadas"). Se
importa `programacion.service` (nunca `.model`/`.repository`).

Nota de diseño — integración con generación automática de llave (FUERA DE
ALCANCE de esta tarea): `ReservaSemestral` (igual que `Programacion`) es
una de las fuentes que puede generar una `Llave` automáticamente al pasar
credencial (ver `llaves.model.OrigenLlave.RESERVA_SEMESTRAL`), pero esa
resolución automática (matching salón+día+hora contra
`ReservaSemestral`/`Programacion` vigentes al momento de escanear una
credencial) es responsabilidad del futuro módulo `nfc` (que todavía no
existe), NO de este módulo ni de `llaves` en este momento — este módulo NO
importa nada de `llaves`, ni siquiera para un caso de uso aparentemente
razonable. A diferencia de `reservas` (`reserva_individual`, que sí tiene
`estado` y sí se integró con `llaves.service.crear_llave` porque había una
transición de estado real que completar al entregar la llave —
'aprobada' -> 'completada'), acá no hay nada que "completar": la reserva
semestral no se consume/agota al usarse una vez, es recurrente semana a
semana durante todo el semestre. Cuando el futuro `nfc` exista, consumirá
este módulo exclusivamente vía `reservas_semestrales.service` (p. ej.
`listar_por_salon_y_dia`), nunca vía `.model`/`.repository` — no se
inventa esa función ahora si no hay un consumidor real todavía; las ya
expuestas (`listar_por_salon_y_dia`) alcanzan para ese futuro consumo sin
necesidad de agregar nada más.

Convención de esta API, igual que el resto de módulos:
- `obtener_por_id`/`listar_*` no lanzan excepción ante "no existe"/"sin
  resultados": devuelven `None`/lista vacía.
- `crear_grupo_reservas_semestrales` lanza `ValueError` cuando
  `salon_id`/`solicitante_id`/`semestre_id` no existen, cuando alguna
  franja viola `hora_inicio < hora_fin`, o cuando alguna franja se solapa
  con otra `reserva_semestral` u otra `Programacion` ya vigente para el
  mismo salón/día.
- `cancelar_grupo` hace un DELETE real (no hay columna `estado` en esta
  tabla, ver `model.py`): devuelve el número de filas borradas, o `None`
  si el grupo no existe (0 filas) — se eligió `None` en vez de `False`
  para distinguirlo sin ambigüedad del caso "grupo existe, 0 filas
  borradas por alguna otra razón" (que no puede ocurrir hoy, pero `None`
  dice explícitamente "no había nada que borrar" sin depender de leer un
  entero). Lanza `ValueError` si el grupo existe pero alguna de sus filas
  tiene `creado_manualmente=False` (cargada institucionalmente, no
  cancelable vía API).
"""

import uuid

from django.db import transaction

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import service as programacion_service
from reservas_semestrales import domain, repository


def listar_reservas_semestrales():
    return repository.listar_reservas_semestrales()


def obtener_por_id(reserva_id):
    """Devuelve la ReservaSemestral con ese id, o None si no existe."""
    return repository.obtener_por_id(reserva_id)


def listar_por_grupo(grupo_id):
    return repository.listar_por_grupo(grupo_id)


def listar_por_salon_y_dia(salon_id, dia: str):
    return repository.listar_por_salon_y_dia(salon_id, dia)


def existe_solapamiento_en_salon_semestral(salon_id, dia: str, hora_inicio, hora_fin) -> bool:
    """True si la franja [hora_inicio, hora_fin) choca con alguna OTRA
    `reserva_semestral` ya existente en ese salón ese día.

    No filtra por `grupo_id`: dos franjas de grupos distintos (o del mismo
    grupo, ver Nota de diseño del módulo) se comparan por igual.
    """
    existentes = repository.listar_por_salon_y_dia(salon_id, dia)
    return any(
        domain.hay_solapamiento(hora_inicio, hora_fin, r.hora_inicio, r.hora_fin)
        for r in existentes
    )


def _validar_y_crear_franja(
    salon_id, solicitante_id, semestre_id, dia, hora_inicio, hora_fin, grupo_id, creado_manualmente
):
    if hora_inicio >= hora_fin:
        raise ValueError(
            f"hora_inicio ({hora_inicio}) debe ser anterior a hora_fin ({hora_fin}) "
            f"para el día {dia}"
        )
    if existe_solapamiento_en_salon_semestral(salon_id, dia, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} el {dia} se solapa con otra reserva "
            f"semestral ya existente en el salón {salon_id}"
        )
    if programacion_service.existe_solapamiento_en_salon(salon_id, dia, hora_inicio, hora_fin):
        raise ValueError(
            f"La franja {hora_inicio}-{hora_fin} el {dia} se solapa con una clase ya "
            f"programada en el salón {salon_id}"
        )
    return repository.crear_reserva_semestral(
        salon_id,
        solicitante_id,
        semestre_id,
        dia,
        hora_inicio,
        hora_fin,
        grupo_id,
        creado_manualmente=creado_manualmente,
    )


@transaction.atomic
def crear_grupo_reservas_semestrales(
    salon_id, solicitante_id, semestre_id, franjas: list[dict], creado_manualmente: bool = True
):
    """Crea todas las franjas de `franjas` (cada una un dict con `dia`,
    `hora_inicio`, `hora_fin`) como un único grupo, compartiendo un
    `grupo_id` generado una sola vez. Todo-o-nada: si cualquier franja
    falla su validación, no se crea ninguna (ver Nota de diseño del
    módulo sobre `transaction.atomic()`).

    Valida primero que `salon_id`/`solicitante_id`/`semestre_id`
    referenciados existan (una sola vez, son compartidos por todo el
    grupo). Luego valida y crea cada franja en orden.
    """
    if not franjas:
        raise ValueError(
            "Debe incluir al menos una franja para crear un grupo de reservas semestrales"
        )
    if catalogos_service.obtener_salon(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    if comunidad_service.obtener_persona(solicitante_id) is None:
        raise ValueError(f"No existe un solicitante (comunidad) con id {solicitante_id}")
    if programacion_service.obtener_semestre(semestre_id) is None:
        raise ValueError(f"No existe un semestre con id {semestre_id}")

    grupo_id = uuid.uuid4()
    return [
        _validar_y_crear_franja(
            salon_id,
            solicitante_id,
            semestre_id,
            franja["dia"],
            franja["hora_inicio"],
            franja["hora_fin"],
            grupo_id,
            creado_manualmente,
        )
        for franja in franjas
    ]


def crear_reserva_semestral(
    salon_id, solicitante_id, semestre_id, dia: str, hora_inicio, hora_fin, creado_manualmente: bool = True
):
    """Atajo de una sola franja: crea un grupo de una única fila (su propio
    `grupo_id` generado igual que cualquier otro grupo). Pensado para
    tests/consumidores simples que no necesitan el caso de uso multi-franja
    — comparte toda la validación de `crear_grupo_reservas_semestrales`, no
    es un camino paralelo.
    """
    creadas = crear_grupo_reservas_semestrales(
        salon_id,
        solicitante_id,
        semestre_id,
        [{"dia": dia, "hora_inicio": hora_inicio, "hora_fin": hora_fin}],
        creado_manualmente=creado_manualmente,
    )
    return creadas[0]


def cancelar_grupo(grupo_id):
    """Borra (DELETE real) todas las filas del grupo `grupo_id`.

    Devuelve la cantidad de filas borradas, o None si el grupo no existe
    (0 filas con ese grupo_id). Lanza ValueError si el grupo existe pero
    fue cargado institucionalmente (`creado_manualmente=False` en alguna de
    sus filas) — ver Nota de diseño del módulo.
    """
    filas = repository.listar_por_grupo(grupo_id)
    if not filas:
        return None
    if any(not fila.creado_manualmente for fila in filas):
        raise ValueError(
            "No se puede cancelar una reserva semestral cargada institucionalmente"
        )
    return repository.eliminar_por_grupo(grupo_id)
