"""
Modelo ORM del módulo notificaciones.

Este módulo es dueño exclusivo de la tabla `notificacion` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql): registra cada mensaje enviado
a una persona de `comunidad`, sea disparado a mano por un `Usuario`
(`tipo='manual'`) o automáticamente por el sistema (`'recordatorio'`/
`'vencimiento'`, ver `service.py` para el detalle de cada uno).

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos deben consumir notificaciones exclusivamente
a través de `notificaciones.service`.

Nota de diseño — dos FKs a dos módulos distintos, mismo patrón ya
establecido en `novedades.model` (FK a `usuarios.model.Usuario`) y
`llaves.model` (FKs a `comunidad.model.Comunidad`/`usuarios.model.
Usuario`): el `ForeignKey` necesita la clase del modelo ajeno importada
acá para declarar la columna, pero eso NO habilita a `notificaciones.
repository`/`service` a importar `comunidad.model`/`usuarios.model`
directamente. Las validaciones de que cada referencia exista pasan por
el `.service` del módulo dueño (ver `service.py`):
`comunidad.service.obtener_persona`, `usuarios.service.obtener_usuario`.
Ninguna de las dos FKs necesita `related_name` explícito: es la única FK
de este modelo hacia cada tabla destino (a diferencia de, p. ej.,
`llaves.model.Llave` con dos FKs a `Comunidad`), así que el accessor
inverso implícito de Django (`notificacion_set`) no tiene ambigüedad.

Nota de diseño — `on_delete=PROTECT` en ambas FKs: el DDL no declara
`ON DELETE` explícito en ninguna, que en Postgres equivale a `NO ACTION`
— en espíritu, lo mismo que `PROTECT` de Django (impide borrar una
persona de comunidad o un usuario que ya tienen notificaciones
asociadas). Mismo criterio que `novedades.model.Novedad.registrado_por`
y las 7 FKs de `llaves.model.Llave`: ninguna FK sin `ON DELETE CASCADE/
SET NULL` explícito en el DDL se mapea a `PROTECT`, nunca a `CASCADE`.

Nota de diseño — `enviado_por` es `null=True, blank=True`: el DDL declara
`enviado_por_id UUID REFERENCES usuario(id)` sin `NOT NULL`, a diferencia
de `destinatario_id` que sí lo es. Ver `service.py` para la semántica de
negocio completa: se llena solo en notificaciones `tipo='manual'`
(alguien de staff envió el mensaje); queda `None` en `'recordatorio'`/
`'vencimiento'` (disparadas por el sistema, sin un usuario detrás).

Nota de diseño — `asunto`/`mensaje` nullable: el DDL declara
`asunto VARCHAR(200)` y `mensaje TEXT` sin `NOT NULL` en ninguna de las
dos — se traduce fiel al DDL (`null=True, blank=True` en ambas), aunque
en la práctica `service.py` siempre intenta poblar `mensaje` antes de
persistir (ver esa capa).

Nota de diseño — `tipo`/`estado_envio` como `CharField`+`TextChoices`+
`CheckConstraint`, no ENUM nativo de Postgres: misma convención ya fijada
por `equipos.model.EstadoEquipo`/`novedades.model.CategoriaNovedad`/
`llaves.model.EstadoLlave` (ver sus propias notas de diseño) — Django no
tiene soporte nativo para `CREATE TYPE ... AS ENUM`; se traduce a
`varchar` + `CHECK` con la misma garantía de integridad observable que el
ENUM nativo del DDL.

Nota de diseño — sin timestamp: a diferencia de otras tablas del sistema
(p. ej. `llave.fecha_hora_entrega`), el DDL de `notificacion` no declara
ninguna columna de fecha/hora. No se agrega una acá por conveniencia: es
fiel al DDL, que es la fuente de verdad de este módulo — mismo criterio
ya aplicado en `novedades.model.Novedad` (ver esa misma nota de diseño
ahí). Si en el futuro hace falta auditar cuándo se envió una
notificación, es una decisión de negocio explícita a tomar después.
"""

import uuid

from django.db import models

from comunidad.model import Comunidad
from usuarios.model import Usuario


class TipoNotificacion(models.TextChoices):
    RECORDATORIO = "recordatorio", "Recordatorio"
    VENCIMIENTO = "vencimiento", "Vencimiento"
    MANUAL = "manual", "Manual"


class EstadoEnvioNotificacion(models.TextChoices):
    ENVIADO = "enviado", "Enviado"
    FALLIDO = "fallido", "Fallido"


class Notificacion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    destinatario = models.ForeignKey(
        Comunidad, on_delete=models.PROTECT, db_column="destinatario_id"
    )
    tipo = models.CharField(max_length=20, choices=TipoNotificacion.choices)
    asunto = models.CharField(max_length=200, null=True, blank=True)
    mensaje = models.TextField(null=True, blank=True)
    estado_envio = models.CharField(
        max_length=10,
        choices=EstadoEnvioNotificacion.choices,
        default=EstadoEnvioNotificacion.ENVIADO,
    )
    enviado_por = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        db_column="enviado_por_id",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "notificacion"
        constraints = [
            models.CheckConstraint(
                check=models.Q(tipo__in=TipoNotificacion.values),
                name="ck_notificacion_tipo_valido",
            ),
            models.CheckConstraint(
                check=models.Q(estado_envio__in=EstadoEnvioNotificacion.values),
                name="ck_notificacion_estado_envio_valido",
            ),
        ]

    def __str__(self) -> str:
        return f"Notificacion {self.tipo} -> {self.destinatario_id} ({self.estado_envio})"
