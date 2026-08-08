"""
domain.py — lógica de negocio pura del módulo comunidad (sin DB, sin I/O).

Revisado contra el análisis de negocio del sistema legacy
(AulaSync/analisis/backend/comunidad.md): `comunidad` es un catálogo
maestro de personas sin máquina de estados ni cálculo — el legacy
tampoco modelaba ninguna regla de negocio no trivial más allá de
validación de forma (required/enum), que acá ya garantiza el esquema de
Postgres (NOT NULL, FK, el índice único parcial de `id_carnet` en
model.py) y el schema de Ninja/Pydantic en controller.py.

La única decisión de diseño con algo de sustancia — qué hacer cuando el
ETL externo sincroniza un `numero_documento` que ya existe vs. uno nuevo
(upsert) — no es lógica pura: necesita consultar la base de datos para
saber si la persona ya existe, así que vive en `service.py`
(`crear_o_actualizar_por_documento`), no acá.

Por eso este archivo no tiene funciones todavía: no existe lógica no
trivial que testear de forma aislada (sin DB) en este módulo. Si en el
futuro aparece una regla real, se agrega acá con su test primero,
siguiendo TDD.
"""
