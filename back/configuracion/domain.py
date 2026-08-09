"""
domain.py — lógica de negocio pura del módulo configuracion (sin DB, sin I/O).

No hay lógica no trivial que encapsular acá: los 4 campos de la tabla
(`limite_antes_mora_minutos`, `max_reintentos_recordatorio`,
`plantilla_recordatorio`, `ubicacion_defecto_id`) son valores de
configuración simples, sin transiciones de estado ni cálculos derivados.
La decisión de diseño real de este módulo (el patrón de singleton de
aplicación) vive en `service.py`, porque necesita leer/escribir en la
base de datos (get-or-create) — no es lógica pura y no pertenece acá.
"""
