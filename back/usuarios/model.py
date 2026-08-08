"""
Modelo ORM del módulo usuarios.

Este módulo es dueño exclusivo de la tabla `usuario` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql). Son las cuentas de staff con
acceso al sistema (administradores/auxiliares/porteros vía `rol_id`),
distintas de `comunidad` (personas externas: docentes/estudiantes/
empleados, futuro módulo aparte).

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos consumen usuarios exclusivamente a través de
`usuarios.service`.

Nota de diseño — FK a `catalogos.model.Rol`/`catalogos.model.Ubicacion`:
la regla dura de "usuarios solo puede importar catalogos.service, nunca
catalogos.model/repository" aplica a la lógica de negocio (repository/
domain/service de este módulo), no a la relación de Django ORM en sí —
el `ForeignKey` necesita la clase del modelo importada para declarar la
columna, igual que `catalogos.model.Salon` importa `Bloque`/
`TipoSilleteria` dentro de su propio módulo. La validación de que el
`rol_id`/`ubicacion_id` recibido exista sí pasa por `catalogos.service`
(ver `service.py`, `crear_usuario`).

Nota de diseño — autenticación (Office 365 / Entra ID):
El DDL nuevo reemplaza el login local del sistema legacy (username +
hash_password + sesiones embebidas, ver
AulaSync/analisis/backend/usuarios.md) por Office 365. Por eso no hay
columna `usuario` (username) ni `hash_password` ni `sesiones` acá — esos
campos del legacy no existen en este DDL y no se replican. El flujo
decidido (AulaSync/analisis/estrategia-migracion/backend.md, sección
Autenticación): un admin precrea el Usuario con `rol_id`/`ubicacion_id`
y `oid_microsoft` en null; el login de Office 365 solo lo vincula por
`email_institucional` en el primer ingreso, seteando `oid_microsoft`
(ver `service.vincular_oid_microsoft`). Validar el JWT de Microsoft es
responsabilidad del futuro módulo `auth`, no de este módulo.

Nota de diseño — `email_institucional` como CharField, no EmailField:
igual que el resto de columnas VARCHAR de catalogos/equipos, se mapea
literal al tipo de Django que representa el ancho de columna del DDL sin
agregar validación adicional a nivel de ORM (no hay precedente de
EmailField en el proyecto); la validación de formato, si se necesita,
va en el schema de Ninja/Pydantic del controller.
"""

import uuid

from django.db import models

from catalogos.model import Rol, Ubicacion


class Usuario(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=150)
    email_institucional = models.CharField(max_length=150, unique=True)
    oid_microsoft = models.CharField(max_length=100, unique=True, null=True, blank=True)
    rol = models.ForeignKey(Rol, on_delete=models.PROTECT, db_column="rol_id")
    ubicacion = models.ForeignKey(Ubicacion, on_delete=models.PROTECT, db_column="ubicacion_id")
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "usuario"

    def __str__(self) -> str:
        return self.email_institucional
