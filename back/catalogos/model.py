"""
Modelos ORM del módulo catalogos.

Este módulo es dueño exclusivo de las tablas: rol, tipo_persona, ubicacion,
bloque, tipo_silleteria, salon (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql).

El UUID de cada PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos.

Regla dura del proyecto: ningún otro módulo debe importar estos modelos
directamente. Otros módulos consumen catalogos exclusivamente a través de
`catalogos.service`.
"""

import uuid

from django.db import models


class Rol(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=30, unique=True)

    class Meta:
        db_table = "rol"

    def __str__(self) -> str:
        return self.nombre


class TipoPersona(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=30, unique=True)

    class Meta:
        db_table = "tipo_persona"

    def __str__(self) -> str:
        return self.nombre


class Ubicacion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=100)
    permite_prestamo_llaves = models.BooleanField(default=True)
    permite_devolucion_llaves = models.BooleanField(default=True)
    permite_prestamo_equipos = models.BooleanField(default=False)

    class Meta:
        db_table = "ubicacion"

    def __str__(self) -> str:
        return self.nombre


class Bloque(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "bloque"

    def __str__(self) -> str:
        return self.nombre


class TipoSilleteria(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "tipo_silleteria"

    def __str__(self) -> str:
        return self.nombre


class Salon(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=30)
    bloque = models.ForeignKey(Bloque, on_delete=models.PROTECT, db_column="bloque_id")
    tipo_silleteria = models.ForeignKey(
        TipoSilleteria, on_delete=models.PROTECT, db_column="tipo_silleteria_id"
    )
    cantidad_sillas = models.IntegerField(default=0)
    cantidad_mesas = models.IntegerField(default=0)

    class Meta:
        db_table = "salon"
        constraints = [
            models.UniqueConstraint(
                fields=["nombre", "bloque"], name="uq_salon_nombre_bloque"
            )
        ]

    def __str__(self) -> str:
        return self.nombre
