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
"""

import datetime


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
