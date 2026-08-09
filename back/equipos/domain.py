"""
domain.py — lógica de negocio pura del módulo equipos (sin DB, sin I/O).

Revisado contra el análisis de negocio del sistema legacy
(AulaSync/analisis/backend/equipos.md): `estado` de equipo
(`activo`/`inactivo`/`mantenimiento` en Mongo) nunca funcionó como una
máquina de estados real — no cambiaba al prestarse/devolverse (ese ciclo
vive denormalizado en `Prestamo.equipos[]`, no en `Equipo`), y
`actualizar()` permitía pasar de cualquier valor a cualquier otro sin
restricción de transición ni siquiera comprobando préstamos activos.

Eso no es una ausencia a corregir acá con una máquina de estados nueva:
con solo 2 valores posibles en el DDL nuevo (`activo`/`inactivo` — el
`mantenimiento` legacy no se portó, ver model.py), no existe una
secuencia de transiciones prohibidas que valga la pena modelar. Es un
interruptor binario, no un flujo con estados intermedios. Cualquier
valor fuera de esos 2 ya lo rechaza la base de datos (constraint
`ck_equipo_estado_valido` en model.py) y el schema de Ninja/Pydantic
(`choices` del enum), así que tampoco hace falta una función de dominio
para revalidarlo en Python antes de persistir.

La relación con `prestamos` (p. ej. si un equipo con préstamo activo
puede inactivarse) es responsabilidad del futuro módulo `prestamos`
cuando exista — `equipos` no la anticipa ni la importa.

Por eso este archivo no tiene funciones todavía: no existe lógica no
trivial que testear de forma aislada (sin DB) en este módulo. Si en el
futuro aparece una regla real, se agrega acá con su test primero,
siguiendo TDD.
"""
