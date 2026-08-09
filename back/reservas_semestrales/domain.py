"""
domain.py — lógica de negocio pura del módulo reservas_semestrales (sin DB,
sin I/O).

`hay_solapamiento` es, en comportamiento, la misma función que
`programacion.domain.hay_solapamiento`/`reservas.domain.hay_solapamiento`
(ver la nota de diseño completa en `reservas/domain.py`: la deuda técnica
de lógica de solapamiento TRIPLICADA en el sistema legacy entre
`programacion`/`reservas`/`reservas_semestrales`). Se REIMPLEMENTA acá en
vez de importarla desde `programacion.domain`/`reservas.domain`, la misma
decisión ya tomada explícitamente para `reservas`: se prefiere una
duplicación deliberada de 3 líneas de lógica pura antes que introducir
CUALQUIER dependencia —así sea solo hacia `domain.py`— entre módulos
hermanos sin una razón de negocio real para conocerse entre sí a ese
nivel. El punto de extensión correcto para cruzar contra `Programacion` ya
existe y SÍ se usa (a diferencia de `reservas`, que hoy no lo necesita):
`service.py` importa `programacion.service.existe_solapamiento_en_salon`
(un `.service`, no un `.domain`) para validar la franja de esta reserva
semestral contra las clases regulares ya programadas.

Es lógica pura y sin estado: dos franjas horarias [inicio, fin) se
solapan si y solo si cada una empieza antes de que la otra termine. No
toca la base de datos — quien la usa (`service.py`) es responsable de
traer las franjas candidatas a comparar.
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
    en cada fila, así que una franja de 8:00-10:00 y otra de 10:00-12:00 en
    el mismo salón/día son válidas y no chocan (mismo criterio que
    `programacion.domain.hay_solapamiento`/`reservas.domain.hay_solapamiento`).
    """
    return hora_inicio_a < hora_fin_b and hora_inicio_b < hora_fin_a
