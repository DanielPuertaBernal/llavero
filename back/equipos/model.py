"""
Modelo ORM del módulo equipos.

Este módulo es dueño exclusivo de la tabla `equipo` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql). Es el módulo más simple del
proyecto: una sola tabla, sin FKs entrantes ni salientes.

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos (el futuro `prestamos`) consumen equipos
exclusivamente a través de `equipos.service`.

Nota de diseño — `estado_equipo_tipo`:
El DDL declara `estado` como un tipo ENUM nativo de Postgres
(`CREATE TYPE estado_equipo_tipo AS ENUM ('activo', 'inactivo')`).
Django no tiene soporte nativo para tipos ENUM de Postgres: crearlo
requeriría SQL crudo en la migración (CREATE TYPE/ALTER COLUMN) o una
dependencia de terceros, y `catalogos` (el único módulo ya construido)
no fijó convención al respecto porque ninguna de sus columnas usa un
enum de la BD. Se optó, deliberadamente, por representar `estado` como
`CharField` con `choices` restringidas a los mismos 2 valores del DDL
(nota: el legacy en Mongo tenía un tercer valor `mantenimiento` que el
DDL nuevo no portó — no se agrega acá tampoco), más un
`CheckConstraint` a nivel de base de datos (`ck_equipo_estado_valido`)
que reproduce la misma garantía de integridad que da el ENUM nativo:
Postgres rechaza cualquier valor fuera de la lista al INSERT/UPDATE,
igual que con el tipo enum. Es una divergencia deliberada de la forma
literal del DDL (varchar+check en vez de tipo enum nativo), no una
omisión de la regla de negocio: el comportamiento observable es
equivalente.

No se modela una máquina de estados aquí (ver domain.py): con solo 2
valores y sin transiciones prohibidas por el análisis de negocio, no
hay lógica no trivial que encapsular.
"""

import uuid

from django.db import models


class EstadoEquipo(models.TextChoices):
    ACTIVO = "activo", "Activo"
    INACTIVO = "inactivo", "Inactivo"


class Equipo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=150)
    marca = models.CharField(max_length=100, null=True, blank=True)
    codigo_inventario = models.CharField(max_length=50, unique=True)
    codigo_barras = models.CharField(max_length=50, unique=True, null=True, blank=True)
    estado = models.CharField(
        max_length=10, choices=EstadoEquipo.choices, default=EstadoEquipo.ACTIVO
    )

    class Meta:
        db_table = "equipo"
        constraints = [
            models.CheckConstraint(
                check=models.Q(estado__in=[EstadoEquipo.ACTIVO, EstadoEquipo.INACTIVO]),
                name="ck_equipo_estado_valido",
            )
        ]

    def __str__(self) -> str:
        return self.nombre
