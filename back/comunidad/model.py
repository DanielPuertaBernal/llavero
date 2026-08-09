"""
Modelo ORM del módulo comunidad.

Este módulo es dueño exclusivo de la tabla `comunidad` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql): el catálogo maestro de
personas de la universidad (docentes/estudiantes/empleados), alimentado
por un ETL externo. No confundir con `usuarios.model.Usuario` (cuentas de
staff con acceso al sistema — admins/auxiliares/porteros — ver ese
módulo): son dos entidades y dos tablas distintas.

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Los futuros módulos `llaves` (resolución de identidad por
NFC), `monitores`, `notificaciones`, `reservas` y `reservas_semestrales`
consumen comunidad exclusivamente a través de `comunidad.service`.

Nota de diseño — FK a `catalogos.model.TipoPersona`: mismo patrón que
`usuarios.model.Usuario` con `Rol`/`Ubicacion` — el `ForeignKey` necesita
la clase del modelo importada acá para declarar la columna, pero eso no
habilita a `comunidad.repository`/`service` a importar `catalogos.model`
directamente. La validación de que `tipo_persona_id` exista pasa por
`catalogos.service.obtener_tipo_persona` (ver `service.py`).

Nota de diseño — unicidad condicional de `id_carnet`: el DDL declara
`id_carnet` nullable con un ÍNDICE ÚNICO PARCIAL
(`CREATE UNIQUE INDEX idx_comunidad_id_carnet ON comunidad(id_carnet)
WHERE id_carnet IS NOT NULL`), no una columna `UNIQUE` a secas. Se
modela con `UniqueConstraint(condition=Q(id_carnet__isnull=False))` —no
`unique=True`— para expresar exactamente esa semántica: cualquier
cantidad de filas con `id_carnet=None` puede convivir, pero dos filas no
nulas con el mismo valor chocan.

Es una corrección deliberada de un bug real del sistema legacy (ver
AulaSync/analisis/backend/comunidad.md, §5 y §7): en Mongo `id_carnet`
no era único (default `''`, sin índice único), así que dos personas
podían terminar compartiendo el mismo carnet por error de carga o
reasignación no limpiada, y el flujo de préstamo de llaves por NFC
(`ComunidadRepository.findByCarnet` con `findOne`) resolvía la identidad
de forma ambigua y silenciosa — devolvía el primer match sin alertar de
la colisión. Con esta constraint, Postgres rechaza el segundo carnet
duplicado directamente en el INSERT/UPDATE.

Nota de diseño — sin soft-delete: a diferencia de `usuario`, el DDL de
`comunidad` no declara columna `activo`; no hay soporte de soft-delete
posible con este esquema. Un DELETE sobre esta tabla es hard delete
físico, igual que el legacy — no es una regresión, es lo que el DDL
permite (ver `service.eliminar_persona`).
"""

import uuid

from django.db import models

from catalogos.model import TipoPersona


class Comunidad(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    numero_documento = models.CharField(max_length=20, unique=True)
    nombre = models.CharField(max_length=150)
    tipo_persona = models.ForeignKey(
        TipoPersona, on_delete=models.PROTECT, db_column="tipo_persona_id"
    )
    id_carnet = models.CharField(max_length=15, null=True, blank=True)
    correo = models.CharField(max_length=150, null=True, blank=True)
    numero_contacto = models.CharField(max_length=30, null=True, blank=True)
    facultad = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = "comunidad"
        constraints = [
            models.UniqueConstraint(
                fields=["id_carnet"],
                condition=models.Q(id_carnet__isnull=False),
                name="idx_comunidad_id_carnet",
            )
        ]

    def __str__(self) -> str:
        return self.nombre
