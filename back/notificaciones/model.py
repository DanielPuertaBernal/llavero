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

Nota de diseño — `prestamo`/`numero_intento`/`fecha_hora` (agregadas
después de la primera versión de esta tabla): la versión original de
`notificacion` no tenía forma de correlacionar un recordatorio con un
préstamo/llave concreto, ni de saber cuándo se envió — ver la sección
"FUERA DE ALCANCE" de `service.py` (versión anterior de ese docstring)
para el gap completo que esto bloqueaba: sin esa correlación,
`notificaciones` no podía aplicar `configuracion.
max_reintentos_recordatorio` (ese límite es "por préstamo/llave", pero la
tabla no sabía POR QUÉ préstamo se mandó cada recordatorio). Se resuelve
extendiendo esta misma tabla (no una tabla satélite nueva): un
recordatorio ya es una fila de `notificacion`, y estas 3 columnas son
metadata de esa misma fila, no una entidad aparte con su propio ciclo de
vida.

Las 3 son NULLABLE porque no aplican a los 3 tipos por igual:
`prestamo`/`numero_intento` solo tienen sentido para `tipo='recordatorio'`
(la correlación que motivó el cambio) — `'manual'`/`'vencimiento'` no
cuentan contra `max_reintentos_recordatorio` y pueden no estar atados a
un préstamo específico (un vencimiento sí podría estarlo en el futuro,
pero eso es una decisión de negocio no tomada acá; un manual, por
definición, es un mensaje libre de un usuario de staff). `fecha_hora`, en
cambio, es auditoría general de "cuándo se envió esta notificación" y en
principio aplicaría a los 3 tipos, pero se declara nullable igual que las
otras dos por consistencia de la columna (ver `service.py` para cuáles
tipos la pueblan hoy) y porque no hay backfill posible para las filas ya
existentes antes de esta migración (quedan con `NULL` en las 3 columnas
nuevas, no con un valor inventado).

Nota de diseño — tipo de `fecha_hora`: se usa `TIMESTAMPTZ` en el DDL (no
`TIMESTAMP` a secas), igual que el resto de columnas de fecha/hora de
este esquema (`llave.fecha_hora_entrega`, `prestamo.fecha_creacion`,
`detalle_prestamo.fecha_entrega`, etc.) y coherente con `USE_TZ = True`
en `settings.py`: un `DateTimeField` de Django con `USE_TZ=True` sobre
`django.db.backends.postgresql` siempre genera `timestamp with time
zone` en la migración, nunca `timestamp` sin zona horaria — declarar
`TIMESTAMP` a secas en el DDL maestro habría quedado desincronizado del
esquema real que Django efectivamente crea.

Nota de diseño — `prestamo` como `ForeignKey` a `prestamos.model.
Prestamo`, `on_delete=PROTECT`: mismo criterio que el resto de FKs de
este archivo (ver nota de diseño de `on_delete=PROTECT` más arriba) — el
DDL no declara `ON DELETE` explícito para `prestamo_id`, así que se
traduce a `PROTECT`, nunca a `CASCADE`. Igual regla dura que
`destinatario`/`enviado_por`: `notificaciones.repository`/`service`
importan esta FK solo para declarar la columna, nunca para tocar
`prestamos.model`/`prestamos.repository` directamente — la validación de
que el préstamo exista pasa por `prestamos.service.obtener_prestamo`
(ver `service.py`), mismo patrón que `comunidad.service.obtener_persona`/
`usuarios.service.obtener_usuario` ya usan en este módulo.

Es la única FK de `Notificacion` hacia `Prestamo` (no hay una segunda
referencia a esa tabla en este modelo), así que tampoco necesita
`related_name` explícito: el accessor inverso implícito de Django
(`notificacion_set` en `Prestamo`) no tiene ambigüedad — mismo
razonamiento que la nota de diseño de `destinatario`/`enviado_por` de
arriba.

Nota de diseño — `numero_intento` sin `CheckConstraint` de rango: a
diferencia de `tipo`/`estado_envio` (dominio cerrado, por eso sí llevan
`CheckConstraint`), un número de intento es un contador sin límite
superior fijo en el DDL — el tope de negocio (`configuracion.
max_reintentos_recordatorio`) es un valor configurable en otra tabla, no
una constante que Postgres pueda validar con un `CHECK` en esta columna;
aplicar ese tope sigue siendo responsabilidad de quien invoca
`enviar_recordatorio` (ver `service.py`), no de esta capa de modelo.

Nota de diseño — `llave` (agregada junto con `sdd/scheduler-transiciones`):
mismo criterio exacto que `prestamo` (ver nota de diseño más arriba) —
`ForeignKey` a `llaves.model.Llave`, `on_delete=PROTECT` (el DDL no
declara `ON DELETE` explícito), `null=True, blank=True`, única FK de este
modelo hacia `Llave` (sin `related_name` explícito, sin ambigüedad).
Mismo import-boundary rule: esta clase se importa acá solo para declarar
la columna — `notificaciones.repository`/`service` NUNCA importan
`llaves.model` directamente, la validación de que la llave exista pasa
por `llaves.service.obtener_llave` (ver `service.py`).

`llave_id`/`prestamo_id` son dos correlaciones alternativas (una
notificación de tipo `'recordatorio'` puede estar motivada por una llave
en mora o, en el futuro, por un préstamo de equipos vencido — nunca por
ambos a la vez: son dos dominios de negocio distintos). Por eso
`ck_notificacion_correlacion_unica` exige que a lo sumo una de las dos
esté poblada; ambas en `NULL` sigue siendo legal (`'manual'`/
`'vencimiento'` sin correlación específica).
"""

import uuid

from django.db import models

from comunidad.model import Comunidad
from llaves.model import Llave
from prestamos.model import Prestamo
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
    prestamo = models.ForeignKey(
        Prestamo,
        on_delete=models.PROTECT,
        db_column="prestamo_id",
        null=True,
        blank=True,
    )
    numero_intento = models.IntegerField(null=True, blank=True)
    fecha_hora = models.DateTimeField(null=True, blank=True)
    llave = models.ForeignKey(
        Llave,
        on_delete=models.PROTECT,
        db_column="llave_id",
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
            models.CheckConstraint(
                check=~(
                    models.Q(llave__isnull=False) & models.Q(prestamo__isnull=False)
                ),
                name="ck_notificacion_correlacion_unica",
            ),
        ]

    def __str__(self) -> str:
        return f"Notificacion {self.tipo} -> {self.destinatario_id} ({self.estado_envio})"
