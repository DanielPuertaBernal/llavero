"""
domain.py — lógica de negocio pura del módulo llaves (sin DB, sin I/O).

Las dos reglas de forma que el DDL no expresa como constraint de esquema
(no hay columna/CHECK en `ubicacion` que amarre "esta ubicación puede
recibir un préstamo/devolución de llave concreto" a una llave concreta —
`permite_prestamo_llaves`/`permite_devolucion_llaves` son banderas de
`catalogos.ubicacion`, ver ese módulo): que la ubicación de entrega
permita préstamo de llaves, y que la ubicación de devolución permita
devolución de llaves. Se validan acá con funciones puras que reciben el
booleano ya resuelto (no el objeto `Ubicacion` ni su id) — mismo espíritu
que `monitores.domain.validar_docente_distinto_de_monitor` recibe los
valores ya resueltos, sin tocar la base de datos ni importar
`catalogos.model`.

`service.crear_llave`/`service.devolver_llave` las invocan antes de
`repository.crear_llave`/`repository.devolver_llave` para devolver un
`ValueError` claro en vez de dejar crear/devolver una llave en una
ubicación que no lo permite (el DDL no tiene ningún CHECK/FK que lo
impida a nivel de esquema).

No se valida acá que una llave ya en estado 'entregado' no pueda
devolverse de nuevo: ni el DDL ni ningún análisis de negocio disponible
para este módulo declaran esa restricción como regla de forma, y no se
inventa una regla de negocio no confirmada — mismo criterio ya aplicado
en `novedades.domain` (no bloquea "re-cerrar" una novedad ya cerrada). Si
en el futuro hace falta, es una decisión de negocio explícita a tomar
después.

Nota de diseño — transición automática a 'demora_entrega' (`es_mora` +
`service.marcar_demora`, ver ese módulo): el DDL declara `estado_llave`
con tres valores (`'en_prestamo'`/`'demora_entrega'`/`'entregado'`), y
`configuracion.model.Configuracion.limite_antes_mora_minutos` (ver DOC/2.
Diseño estratégico/2.1 Modelo Dominio Anémico.md, entidad Configuración:
"Minutos desde la entrega antes de pasar a demora_entrega") confirma que
`demora_entrega` es una transición automática por tiempo transcurrido,
no una acción explícita de un usuario. El mecanismo que dispara la
transición (el futuro `scheduler`, ver `sdd/scheduler-transiciones`) vive
fuera de este módulo — acá solo se modela la decisión pura ("¿ya pasó el
límite?", `es_mora`) y la transición de estado en sí
(`service.marcar_demora`), ambas con especificación completa y
verificable contra el DDL. `es_mora` recibe `fecha_hora_entrega` y
`ahora` ya como datetimes aware (`USE_TZ=True`) — no calcula ningún
"ahora" internamente, mismo criterio que el resto del proyecto (ver
`repository.py`).
"""

import datetime


def validar_permite_prestamo(permite_prestamo_llaves: bool) -> None:
    """La ubicación de entrega debe permitir préstamo de llaves
    (`catalogos.Ubicacion.permite_prestamo_llaves`).

    Lanza ValueError si `permite_prestamo_llaves` es False.
    """
    if not permite_prestamo_llaves:
        raise ValueError(
            "La ubicación de entrega no permite préstamo de llaves"
        )


def validar_permite_devolucion(permite_devolucion_llaves: bool) -> None:
    """La ubicación de devolución debe permitir devolución de llaves
    (`catalogos.Ubicacion.permite_devolucion_llaves`).

    Lanza ValueError si `permite_devolucion_llaves` es False.
    """
    if not permite_devolucion_llaves:
        raise ValueError(
            "La ubicación de devolución no permite devolución de llaves"
        )


def es_mora(
    fecha_hora_entrega: datetime.datetime,
    limite_minutos: int,
    ahora: datetime.datetime,
) -> bool:
    """True si ya pasó `limite_minutos` desde `fecha_hora_entrega` respecto
    de `ahora` — la decisión pura detrás de la transición
    `service.marcar_demora` (ver nota de diseño del módulo).

    `fecha_hora_entrega` y `ahora` son datetimes aware (`USE_TZ=True`).
    Exactamente en el límite (`ahora == fecha_hora_entrega + límite`) NO es
    mora todavía — el límite es el instante en que empieza a serlo, no
    antes.
    """
    return ahora > fecha_hora_entrega + datetime.timedelta(minutes=limite_minutos)
