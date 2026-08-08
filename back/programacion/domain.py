"""
domain.py — lógica de negocio pura del módulo programacion (sin DB, sin I/O).

`hay_solapamiento` es la pieza reutilizable que resuelve la deuda técnica
señalada en AulaSync/analisis/estrategia-migracion/backend.md (sección
"Deuda técnica que esta migración debe resolver"): en el sistema legacy la
lógica de solapamiento de horarios estaba TRIPLICADA — `programacion`,
`reservas` y `reservas_semestrales` traían cada uno su propia
implementación, divergentes entre sí. Los otros dos módulos todavía no
existen en este backend (se construyen más adelante), pero esta función
queda lista para que los consuman vía `programacion.service` (nunca
importando `programacion.domain`/`model`/`repository` directamente) en
cuanto se construyan.

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
    en cada fila, así que una clase de 8:00-10:00 y otra de 10:00-12:00 en
    el mismo salón/día son válidas y no chocan.
    """
    return hora_inicio_a < hora_fin_b and hora_inicio_b < hora_fin_a
