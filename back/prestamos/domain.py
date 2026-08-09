"""
domain.py — lógica de negocio pura del módulo prestamos (sin DB, sin
I/O).

`validar_permite_prestamo` es la regla de forma que el DDL no expresa
como constraint de esquema (no hay columna/CHECK en `ubicacion` que
amarre "esta ubicación puede recibir un préstamo de equipos concreto" a
un préstamo concreto — `permite_prestamo_equipos` es una bandera de
`catalogos.ubicacion`, ver ese módulo): que la ubicación de entrega
permita préstamo de equipos. Se valida acá con una función pura que
recibe el booleano ya resuelto (no el objeto `Ubicacion` ni su id) —
mismo espíritu que `llaves.domain.validar_permite_prestamo`/
`monitores.domain.validar_docente_distinto_de_monitor` reciben los
valores ya resueltos, sin tocar la base de datos ni importar
`catalogos.model`.

`validar_equipo_disponible` es el pre-check explícito de disponibilidad
que este módulo SÍ agrega (a diferencia de `llaves` con su
`UniqueConstraint` equivalente `idx_llave_activa_unica_por_salon`) — ver
la Nota de diseño completa en `model.py` sobre por qué el criterio es
distinto acá: `equipos.service` delega expresamente a `prestamos` la
responsabilidad de calcular disponibilidad real. Recibe el booleano ya
resuelto por `service.py` (consultando `repository.
existe_detalle_entregado_para_equipo`), no toca la base de datos.

`todos_devueltos` es la función pura que decide si un préstamo quedó
completamente devuelto tras una operación de `service.devolver_equipos`
— recibe la lista de `estado_equipo` de TODOS los `DetallePrestamo` del
préstamo (ya con las actualizaciones de la operación en curso
aplicadas), sin tocar la base de datos ni importar el enum de
`model.py` (compara por valor string, mismo criterio que
`monitores.domain.validar_docente_distinto_de_monitor` compara ids por
valor sin acoplarse a un tipo concreto).
"""


def validar_permite_prestamo(permite_prestamo_equipos: bool) -> None:
    """La ubicación debe permitir préstamo de equipos
    (`catalogos.Ubicacion.permite_prestamo_equipos`).

    Lanza ValueError si `permite_prestamo_equipos` es False.

    No existe una `validar_permite_devolucion` equivalente en este
    módulo: a diferencia de `catalogos.Ubicacion.
    permite_devolucion_llaves` (que sí existe para `llaves`), el DDL NO
    declara ningún campo `permite_devolucion_equipos` — no se valida ni
    se inventa esa restricción al devolver equipos (ver Nota de diseño
    en `service.py`, `devolver_equipos`).
    """
    if not permite_prestamo_equipos:
        raise ValueError("La ubicación no permite préstamo de equipos")


def validar_equipo_disponible(equipo_id, ya_entregado: bool) -> None:
    """Un equipo no puede estar 'entregado' en dos préstamos activos a
    la vez (mismo principio que `idx_llave_activa_unica_por_salon` en
    `llaves`, ver `idx_equipo_entregado_unico` en `model.py`).

    Lanza ValueError si `ya_entregado` es True.
    """
    if ya_entregado:
        raise ValueError(f"El equipo {equipo_id} ya está prestado")


def todos_devueltos(estados_equipo: list) -> bool:
    """True si TODOS los elementos de `estados_equipo` son 'devuelto'
    (el valor string de `EstadoDetalleEquipo.DEVUELTO`).

    `service.devolver_equipos` la usa, tras marcar los equipos
    solicitados como devueltos, para decidir si el préstamo pasa a
    'completamente_devuelto' y si la `Devolucion` que se crea en esa
    misma operación tiene `es_completa=True`.

    Una lista vacía devuelve False deliberadamente: un préstamo sin
    ningún detalle no puede considerarse "completamente devuelto" (hoy
    no debería poder existir, porque `service.crear_prestamo` exige al
    menos un equipo, pero esta función no depende de esa invariante
    externa y se queda del lado seguro).
    """
    return len(estados_equipo) > 0 and all(
        estado == "devuelto" for estado in estados_equipo
    )
