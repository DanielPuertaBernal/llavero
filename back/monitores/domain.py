"""
domain.py — lógica de negocio pura del módulo monitores (sin DB, sin I/O).

Revisado contra el análisis de negocio del sistema legacy
(AulaSync/analisis/backend/monitores.md, §4.1): la única regla de forma
que el legacy validaba explícitamente en el flujo de registro —
"un docente no puede ser monitor de sí mismo"— sigue aplicando al DDL
nuevo, y ya está garantizada a nivel de esquema por
`CHECK (docente_titular_id != monitor_delegado_id)` (ver model.py). Se
anticipa acá con una función pura porque no necesita tocar la base de
datos: compara dos ids por valor, igual que
`usuarios.domain.validar_desactivacion` anticipa la autoprotección de
desactivación antes de llegar al repository.

`service.crear_monitor` la invoca antes de `repository.crear_monitor`
para devolver un `ValueError` claro en vez de dejar propagar el
`IntegrityError` crudo de Postgres — mismo espíritu que
`programacion.service.crear_programacion` valida FKs antes del INSERT.
"""


def validar_docente_distinto_de_monitor(docente_titular_id, monitor_delegado_id) -> None:
    """Un docente titular no puede ser, a la vez, su propio monitor
    delegado. Compara los ids por valor (str), no por tipo, porque
    pueden llegar como UUID del ORM o como str de un payload HTTP —
    ambas formas del mismo id deben reconocerse como "la misma persona".

    Lanza ValueError si docente_titular_id == monitor_delegado_id.
    """
    if str(docente_titular_id) == str(monitor_delegado_id):
        raise ValueError(
            "El docente titular no puede ser, a la vez, el monitor delegado"
        )
