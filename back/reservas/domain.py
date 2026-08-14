"""
domain.py — lógica de negocio pura del módulo reservas (sin DB, sin I/O).

`hay_solapamiento` es, en comportamiento, la misma función que
`programacion.domain.hay_solapamiento` (ver esa nota de diseño completa:
la deuda técnica de lógica de solapamiento TRIPLICADA en el sistema legacy
entre `programacion`/`reservas`/`reservas_semestrales`). Se REIMPLEMENTA
acá en vez de importarla desde `programacion.domain`, una decisión
explícita tomada para esta tarea: aunque un import de una función pura de
`programacion.domain` (sin ORM, sin estado) técnicamente no violaría la
regla dura "solo `.service` es cross-módulo" (esa regla existe para evitar
acoplar la capa de persistencia/orquestación de dos módulos, no funciones
puras sin ningún efecto), se prefiere una duplicación deliberada de 3
líneas de lógica pura antes que introducir CUALQUIER dependencia —así sea
solo hacia `domain.py`— entre `reservas` y `programacion`: dos módulos que
hoy no tienen ninguna razón de negocio real para conocerse (a diferencia
de `llaves` -> `reservas`, que sí es una integración real acordada
explícitamente, ver `llaves/service.py`). Si en el futuro aparece un
requisito de negocio real para que `reservas` valide sus horarios también
contra las clases regulares ya programadas, el punto de extensión correcto
es importar `programacion.service.existe_solapamiento_en_salon` desde
`reservas.service` (un `.service`, no un `.domain`) — no se inventa ese
requisito ahora.

Es lógica pura y sin estado: dos franjas horarias [inicio, fin) se
solapan si y solo si cada una empieza antes de que la otra termine. No
toca la base de datos — quien la usa (`service.py`) es responsable de
traer las reservas candidatas a comparar.

Nota de diseño — `es_no_reclamada` (transición automática `'aprobada'` ->
`'no_reclamada'`, ver `service.marcar_no_reclamada`): anclada en
`hora_inicio` (no `hora_fin`), decisión de negocio tomada explícitamente
para `sdd/scheduler-transiciones` — una reserva que nadie reclamó al
empezar su franja es "no reclamada" a partir de
`hora_inicio + límite`, sin importar cuánto dure la reserva. Combina
`fecha` (DateField) + `hora_inicio` (TimeField) en un datetime aware vía
`timezone.make_aware(datetime.combine(...))`: el proyecto corre con
`USE_TZ=True` y `TIME_ZONE="America/Bogota"`, zona sin DST desde 1993, así
que `make_aware` nunca puede lanzar por hora ambigua/inexistente acá (ver
diseño completo en `sdd/scheduler-transiciones/design`).
"""

import datetime

from django.utils import timezone

DIAS_SEMANA = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
]


def dia_semana_de_fecha(fecha: datetime.date) -> str:
    """Mapea `fecha.weekday()` (convención de Python: 0=lunes ...
    6=domingo) al string de día de semana correspondiente (mismos 7
    valores que `programacion.model.DiaSemana`/
    `reservas_semestrales.model.DiaSemana`).

    Necesaria para RF15 (validación cruzada de horarios): `ReservaIndividual`
    vive anclada a una `fecha` puntual concreta, mientras que
    `Programacion`/`ReservaSemestral` viven ancladas a un `dia` recurrente
    que se repite cada semana durante todo el semestre (sin `fecha`) — no
    hay columna común entre esta fuente y esas dos. Para que
    `crear_reserva` pueda preguntar "¿esta fecha puntual, en el día de la
    semana que le corresponde, choca con alguna clase ya programada o
    reserva semestral vigente?" (ver `service.crear_reserva`), hace falta
    convertir la `fecha` de la nueva reserva al `dia` recurrente
    equivalente — eso es lo que resuelve esta función.

    Reimplementada acá (en vez de importada desde
    `disponibilidad.domain`/`programacion.domain`) por el mismo criterio ya
    aplicado a `hay_solapamiento` en este archivo: se prefiere una
    duplicación deliberada de unas pocas líneas de lógica pura antes que la
    primera excepción a la regla dura "un módulo consume a otro solo vía su
    `.service`, nunca vía `.domain`".
    """
    return DIAS_SEMANA[fecha.weekday()]


def hay_solapamiento(
    hora_inicio_a: datetime.time,
    hora_fin_a: datetime.time,
    hora_inicio_b: datetime.time,
    hora_fin_b: datetime.time,
) -> bool:
    """Devuelve True si las franjas [hora_inicio_a, hora_fin_a) y
    [hora_inicio_b, hora_fin_b) se superponen en algún punto.

    Dos franjas adyacentes (una termina exactamente cuando empieza la
    otra) NO se consideran solapadas: el DDL exige `hora_inicio < hora_fin`
    en cada fila, así que una reserva de 8:00-10:00 y otra de 10:00-12:00
    en el mismo salón/fecha son válidas y no chocan (mismo criterio que
    `programacion.domain.hay_solapamiento`).
    """
    return hora_inicio_a < hora_fin_b and hora_inicio_b < hora_fin_a


def es_no_reclamada(
    fecha: datetime.date,
    hora_inicio: datetime.time,
    limite_minutos: int,
    ahora: datetime.datetime,
) -> bool:
    """True si ya pasó `limite_minutos` desde el inicio de la franja
    (`fecha` + `hora_inicio`) respecto de `ahora` — la decisión pura
    detrás de la transición `service.marcar_no_reclamada` (ver nota de
    diseño del módulo).

    `ahora` es un datetime aware (`USE_TZ=True`). Exactamente en el
    límite NO es no-reclamada todavía — mismo criterio que
    `llaves.domain.es_mora`.
    """
    inicio = timezone.make_aware(datetime.datetime.combine(fecha, hora_inicio))
    return ahora > inicio + datetime.timedelta(minutes=limite_minutos)
