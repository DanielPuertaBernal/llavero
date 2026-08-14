"""
domain.py — lógica de negocio pura del módulo historial (sin DB, sin
I/O).

Este módulo no tiene tabla propia ni modelo ORM (ver docstring de
`apps.py`): no hay ningún CHECK/constraint del DDL que proteger acá — es
simplemente donde vive la lógica pura, testeable sin base de datos, que
`service.listar_historial` usa para (a) ordenar la lista unificada de
eventos "llave"/"equipo" por fecha/hora, y (b) filtrar esa lista a los
eventos procesados por un `usuario_id` concreto (RF28).

Ambas funciones operan sobre la misma forma de "evento" que documenta
`service.py` (un `dict` con, como mínimo, las claves `fecha_hora`
—string ISO 8601— y `procesado_por_id` —string—): no les importa de qué
fuente (`llaves`/`prestamos`) vino cada evento, solo esas dos claves
comunes a todos.
"""


def ordenar_por_fecha_desc(eventos: list[dict]) -> list[dict]:
    """Devuelve una NUEVA lista con los mismos eventos ordenados por
    `fecha_hora` descendente (el más reciente primero) — el orden que
    espera una tabla de historial en el frontend. No muta `eventos`.

    `fecha_hora` es un string ISO 8601 (ver docstring de `service.py`):
    el formato ISO 8601 con offset explícito ordena lexicográficamente
    igual que cronológicamente siempre que todos los eventos usen el
    mismo offset — que es el caso acá, porque `service.py` siempre
    serializa con `.isoformat()` sobre un `datetime` aware en la misma
    zona horaria (`USE_TZ=True`, ver `config/settings.py`), así que no
    hace falta parsear cada string de vuelta a `datetime` para comparar.
    """
    return sorted(eventos, key=lambda evento: evento["fecha_hora"], reverse=True)


def filtrar_por_procesado_por(eventos: list[dict], usuario_id: str) -> list[dict]:
    """Devuelve solo los eventos cuyo `procesado_por_id` sea exactamente
    `usuario_id` (comparación de strings) — el mecanismo con el que
    `service.listar_historial(usuario_id=...)` implementa la restricción
    de RF28 ("Portero debe ver únicamente el historial de lo que él
    mismo procesó")."""
    return [evento for evento in eventos if evento["procesado_por_id"] == usuario_id]
