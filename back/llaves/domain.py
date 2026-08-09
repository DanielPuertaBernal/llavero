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

Nota de diseño — transición automática a 'demora_entrega' fuera de
alcance: el DDL declara `estado_llave` con tres valores
(`'en_prestamo'`/`'demora_entrega'`/`'entregado'`), y
`configuracion.model.Configuracion.limite_antes_mora_minutos` (ver DOC/2.
Diseño estratégico/2.1 Modelo Dominio Anémico.md, entidad Configuración:
"Minutos desde la entrega antes de pasar a demora_entrega") confirma que
`demora_entrega` es una transición automática por tiempo transcurrido,
no una acción explícita de un usuario. Pero ningún documento de
análisis disponible para este módulo especifica el mecanismo (cron/job
periódico, workers, un endpoint de "barrido" invocado externamente,
etc.) ni el módulo dueño de dispararla — no existe todavía ningún módulo
`notificaciones`/scheduler en este backend. Implementar esa transición
acá sería inventar un mecanismo no especificado. Este módulo solo modela
las dos transiciones con especificación completa y verificable contra el
DDL: `crear_llave` (nace en `'en_prestamo'`, default del DDL) y
`devolver_llave` (`-> 'entregado'`, explícita, iniciada por un
usuario/porteria). Cuando el mecanismo de mora se especifique, es una
extensión aditiva a este módulo (probablemente un
`service.marcar_demora(llave_id)` invocado por el futuro scheduler), no
un cambio a lo ya construido.
"""


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
