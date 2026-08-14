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
    valores que `DiaSemana` en `model.py`).

    Necesaria para RF15 (validación cruzada de horarios entre
    `programacion`/`reservas_semestrales`/`reservas`, ver DOC/2. Diseño
    estratégico/2.2 Requerimientos.md): `Programacion` vive anclada a un
    `dia` recurrente que se repite cada semana durante todo el semestre
    (sin una `fecha` puntual), mientras que `reservas.ReservaIndividual`
    vive anclada a una `fecha` puntual concreta (sin día de la semana
    recurrente explícito) — no existe una columna común entre ambas
    fuentes con la que comparar directamente. Para que
    `crear_programacion` pueda preguntar "¿alguna `ReservaIndividual`
    aprobada, en alguna fecha del semestre, cae en este mismo día de la
    semana y choca en horario?" (ver `service.crear_programacion`), hace
    falta poder convertir cada `fecha` candidata de esa consulta al `dia`
    recurrente que le corresponde — eso es lo que resuelve esta función.

    Reimplementada acá en vez de importada desde
    `disponibilidad.domain.dia_semana_de_fecha` (la primera versión de
    esta lógica en el proyecto, ver ese módulo — RF14/RF15): mismo
    criterio ya establecido para `hay_solapamiento` en este mismo archivo
    y en `reservas.domain`/`reservas_semestrales.domain` — la regla dura
    del proyecto ("un módulo consume a otro solo vía su `.service`, nunca
    vía `.model`/`.repository`/`.domain`") no hace excepción para
    funciones puras de `domain.py`, así que se prefiere una duplicación
    deliberada de unas pocas líneas antes que esa primera excepción.
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
    en cada fila, así que una clase de 8:00-10:00 y otra de 10:00-12:00 en
    el mismo salón/día son válidas y no chocan.
    """
    return hora_inicio_a < hora_fin_b and hora_inicio_b < hora_fin_a
