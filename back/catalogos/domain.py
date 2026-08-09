"""
domain.py — lógica de negocio pura del módulo catalogos (sin DB, sin I/O).

Revisado contra el análisis de negocio (analisis/backend/catalogos.md):
las 6 entidades de este módulo (rol, tipo_persona, ubicacion, bloque,
tipo_silleteria, salon) son catálogos de datos maestros sin reglas de
cálculo, transición de estado ni construcción compleja. En particular:

- El análisis marca `tipo_silleteria` como "catálogo puramente decorativo,
  sin consumidores reales fuera de su propio módulo" en el sistema legacy,
  y señala que `salon.tipo_silleteria` hoy se guarda como texto libre SIN
  validar contra el catálogo. En el modelo nuevo esa integridad ya la
  garantiza la base de datos: `salon.tipo_silleteria_id` es FK NOT NULL
  contra `tipo_silleteria`, así que Postgres rechaza cualquier valor que
  no exista — no hace falta una función de dominio para revalidarlo.
- Lo mismo aplica a `salon.bloque_id`: FK NOT NULL, integridad garantizada
  por el motor, no por una regla de negocio explícita.

Por eso este archivo no tiene funciones todavía: no existe lógica no
trivial que testear de forma aislada (sin DB) en este módulo. Si en el
futuro aparece una regla real (p. ej. validaciones de negocio sobre
`ubicacion` más allá de sus banderas de permiso), se agrega aquí con su
test primero, siguiendo TDD.
"""
