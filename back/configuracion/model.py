"""
Modelo ORM del módulo configuracion.

Este módulo es dueño exclusivo de la tabla `configuracion` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql).

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. El futuro módulo `notificaciones` (motor de vencimiento de
préstamos de llaves) consume configuracion exclusivamente a través de
`configuracion.service`.

Nota de diseño — FK a `catalogos.model.Ubicacion`: mismo patrón que
`usuarios.model.Usuario` con `Rol`/`Ubicacion` o `comunidad.model.
Comunidad` con `TipoPersona` — el `ForeignKey` necesita la clase del
modelo importada acá para declarar la columna, pero eso no habilita a
`configuracion.repository`/`service` a importar `catalogos.model`
directamente. La validación de que `ubicacion_defecto_id` exista pasa por
`catalogos.service.obtener_ubicacion` (ver `service.py`).

Nota de diseño — sin UNIQUE/CHECK de fila única (ver `service.py` para la
decisión completa): el DDL modela esta tabla como configuración GLOBAL
única del sistema (a diferencia del legacy, que tenía una fila de
configuración POR bloque edilicio más un pseudo-singleton `__defaults__`
— ver AulaSync/analisis/backend/configuracion.md §5 y §7 para el bug de
auditoría que esa complejidad causaba). El DDL nuevo eliminó esa
complejidad de raíz: es una tabla plana, sin `nombre_bloque`, sin
relación con `bloque`, pensada para tener una única fila viva. Pero el
DDL no declara ningún `UNIQUE`/`CHECK` que lo fuerce a nivel de base de
datos —así que ese modelo NO lo agrega tampoco (sería inventar una
restricción que el DDL no pide)—; la invariante de "una sola fila" se
refuerza en `service.py`, la capa que sí tiene contexto de negocio para
decidir qué hacer cuando ya existe una.
"""

import uuid

from django.db import models

from catalogos.model import Ubicacion


class Configuracion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    limite_antes_mora_minutos = models.IntegerField(default=120)
    max_reintentos_recordatorio = models.IntegerField(default=3)
    plantilla_recordatorio = models.TextField(null=True, blank=True)
    ubicacion_defecto = models.ForeignKey(
        Ubicacion, on_delete=models.PROTECT, db_column="ubicacion_defecto_id"
    )

    class Meta:
        db_table = "configuracion"

    def __str__(self) -> str:
        return f"configuracion({self.id})"
