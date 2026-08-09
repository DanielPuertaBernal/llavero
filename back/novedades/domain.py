"""
domain.py — lógica de negocio pura del módulo novedades (sin DB, sin I/O).

La única regla de forma que el DDL no expresa como constraint (ver
model.py, nota de diseño sobre `estado`): cerrar una novedad exige
documentar la solución. Se valida acá con una función pura que compara
el valor recibido, mismo espíritu que
`monitores.domain.validar_docente_distinto_de_monitor` anticipa una
regla de negocio antes de tocar la base de datos.

`service.cerrar_novedad` la invoca antes de `repository.cerrar_novedad`
para devolver un ValueError claro en vez de dejar cerrar una novedad sin
solución documentada.

No se valida acá que la novedad esté en estado 'abierta' antes de
cerrarla (es decir, no se bloquea "re-cerrar" una novedad ya cerrada,
sobrescribiendo su solución): ni el DDL ni ningún análisis de negocio
disponible para este módulo declaran esa restricción, y no se inventa
una regla de negocio no confirmada — mismo criterio que
`monitores.model` no inventa un índice único que el DDL no pide. Si en
el futuro hace falta, es una decisión de negocio explícita a tomar
después.
"""


def validar_cierre(solucion: str | None) -> None:
    """Una novedad no puede cerrarse sin una solución documentada.

    Lanza ValueError si `solucion` es None o una cadena vacía/solo
    espacios en blanco.
    """
    if solucion is None or not solucion.strip():
        raise ValueError(
            "No se puede cerrar una novedad sin una solución documentada"
        )
