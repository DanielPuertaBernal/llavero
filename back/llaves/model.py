"""
Modelo ORM del módulo llaves.

Este módulo es dueño exclusivo de la tabla `llave` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, sección "Llaves"): registra
cada préstamo físico de la llave de un salón, desde la entrega hasta la
devolución. Es el núcleo del sistema (le da nombre al proyecto).

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos deben consumir llaves exclusivamente a través
de `llaves.service`.

Nota de diseño — 7 FKs a 4 módulos distintos, todas con la excepción
documentada de import cross-módulo en `model.py`: mismo patrón ya
establecido en `novedades.model` (FK a `usuarios.model.Usuario`),
`monitores.model` (dos FKs a `comunidad.model.Comunidad`) y
`programacion.model` (FK a `catalogos.model.Salon`/
`comunidad.model.Comunidad`) — el `ForeignKey` necesita la clase del
modelo ajeno importada acá para declarar la columna, pero eso NO
habilita a `llaves.repository`/`domain`/`service` a importar esos
`model.py` directamente. Las validaciones de que cada referencia exista
pasan por el `.service` del módulo dueño (ver `service.py`):
`catalogos.service.obtener_salon`/`obtener_ubicacion`,
`comunidad.service.obtener_persona`, `usuarios.service.obtener_usuario`,
`novedades.service.obtener_novedad`.

Nota de diseño — dos FKs a `comunidad.model.Comunidad`
(`docente_titular`/`reclamado_por`), dos a `usuarios.model.Usuario`
(`usuario_entrega`/`usuario_recibe`) y dos a `catalogos.model.Ubicacion`
(`ubicacion_entrega`/`ubicacion_devolucion`): mismo patrón que las dos
FKs de `monitores.model.Monitor` a `Comunidad` — cada una necesita su
propio `related_name` explícito (si no, Django choca con el accessor
inverso por defecto compartido, p. ej. `llave_set` repetido dos veces
en el mismo modelo destino). Se usan nombres descriptivos que documentan
el rol de cada lado de la relación. `salon` y `novedad` sí pueden usar el
`related_name` implícito de Django (`llave_set`): cada una es la única
FK de este modelo hacia su tabla destino, sin ambigüedad posible.

Nota de diseño — `on_delete=PROTECT` en las 7 FKs: el DDL no declara
`ON DELETE` explícito en ninguna, que en Postgres equivale a `NO ACTION`
— en espíritu, lo mismo que `PROTECT` de Django (impide borrar una
entidad referenciada por una llave, sea activa o histórica). Mismo
criterio que `novedades.model.Novedad.registrado_por` y
`monitores.model.Monitor`: ninguna FK sin `ON DELETE CASCADE/SET NULL`
explícito en el DDL se mapea a `PROTECT`, nunca a `CASCADE` (que
borraría en silencio historial de auditoría de préstamos).

Nota de diseño — `estado_llave`/`origen_llave`/`tipo_entrega_llave` como
`CharField`+`TextChoices`+`CheckConstraint`, no ENUM nativo de Postgres:
misma convención ya fijada por `equipos.model.EstadoEquipo`/
`novedades.model.CategoriaNovedad` (ver sus propias notas de diseño) —
Django no tiene soporte nativo para `CREATE TYPE ... AS ENUM`; se traduce
a `varchar` + `CHECK` con la misma garantía de integridad observable que
el ENUM nativo del DDL. `TipoEntregaLlave` se reutiliza tal cual para
`tipo_entrega` (NOT NULL) y `tipo_devolucion` (nullable): el DDL declara
ambas columnas con el mismo tipo `tipo_entrega_llave`, así que un único
`TextChoices` con dos `CheckConstraint` independientes (uno por columna,
el de `tipo_devolucion` con la disyunción `OR NULL`) es la traducción
fiel — no hace falta duplicar la clase de choices.

Nota de diseño — `origen` es un enum de solo forma, sin FK real: el DDL
declara `origen origen_llave NOT NULL` con valores
`'programacion'/'reserva_semestral'/'reserva_individual'/'manual'`, pero
la columna NO referencia ninguna tabla — es un `varchar` con `CHECK`,
igual que `categoria`/`estado` en `novedades`. Los módulos `reservas`/
`reservas_semestrales` que motivan dos de esos valores todavía no existen
en este backend; no se inventa ninguna FK ni stub hacia ellos. Cuando se
construyan, seguirán sin ser una FK real de todos modos (el DDL nunca lo
pidió), así que este modelo no necesita cambiar cuando eso ocurra.

Nota de diseño — `fecha_hora_entrega` con `auto_now_add=True`: el DDL
declara `TIMESTAMPTZ NOT NULL DEFAULT now()`, mismo patrón ya usado en
`auth.model.SesionRefresh.fecha_emision`/
`CodigoLoginTemporal.fecha_emision` para la misma semántica de columna
("se llena sola al crear la fila, nunca se edita después").
`fecha_hora_devolucion`, en cambio, es un `DateTimeField` normal
(nullable): se llena explícitamente en `service.devolver_llave` con un
`timezone.now()` calculado UNA vez ahí y pasado a `repository.
devolver_llave`, nunca calculado dentro del repository — mismo patrón
documentado en `auth.repository` (permite testear con un "ahora" fijo y
mantiene un único timestamp consistente por operación de negocio).

Nota de diseño — CHECK de fechas replicado del DDL, no inventado: el DDL
declara `CHECK (fecha_hora_devolucion IS NULL OR fecha_hora_devolucion >
fecha_hora_entrega)`. Se traduce literal a `CheckConstraint`, mismo
patrón que `ck_programacion_horario_valido` en `programacion.model`
(comparación de dos columnas de la misma fila con `models.F()`).

Nota de diseño — `idx_llave_docente_titular` (índice DDL sobre una
columna FK) NO se declara como `models.Index` explícito acá: Django ya
crea automáticamente un índice de columna simple sobre toda
`ForeignKey` (comportamiento por defecto, `db_index` implícito). Un
`models.Index` adicional con ese nombre sería un índice duplicado sobre
la misma columna. Mismo criterio ya aplicado en este proyecto a
`idx_sesion_refresh_usuario`/`idx_codigo_login_temporal_usuario` (ver
`auth.model`): ninguno de los dos se declara explícito, por la misma
razón. `idx_llave_estado`, en cambio, SÍ se declara explícito
(`models.Index`) porque `estado` no es una FK — sin la FK gratis de
Django, ese índice no existiría si no se declara.

Nota de diseño — `idx_llave_activa_unica_por_salon` como
`UniqueConstraint` condicional (RNF02: no puede haber dos llaves activas
del mismo salón a la vez, la regla de negocio real que motivó parte de
esta migración): el DDL lo declara como índice único PARCIAL
(`CREATE UNIQUE INDEX ... ON llave(salon_id) WHERE estado != 'entregado'`),
no una columna `UNIQUE` a secas — cualquier cantidad de llaves ya
`'entregado'` para el mismo salón puede convivir (son historial), pero
dos filas no-`'entregado'` (`'en_prestamo'`/`'demora_entrega'`) para el
mismo salón chocan. Se modela con
`UniqueConstraint(condition=~Q(estado='entregado'))`, mismo patrón ya
usado en `comunidad.model.Comunidad` para la unicidad condicional de
`id_carnet` (ver esa nota de diseño). Es la traducción exacta de una
regla de integridad que la base de datos debe garantizar siempre (no una
validación de negocio anticipable de forma útil en `domain.py`: dos
llaves entregadas "al mismo tiempo" para el mismo salón es una condición
de carrera entre dos requests concurrentes, exactamente el escenario que
un `CHECK`/índice a nivel de base de datos resuelve y una validación en
Python, con una consulta previa no atómica, no puede garantizar).
"""

import uuid

from django.db import models

from catalogos.model import Salon, Ubicacion
from comunidad.model import Comunidad
from novedades.model import Novedad
from usuarios.model import Usuario


class EstadoLlave(models.TextChoices):
    EN_PRESTAMO = "en_prestamo", "En préstamo"
    DEMORA_ENTREGA = "demora_entrega", "Demora en la entrega"
    ENTREGADO = "entregado", "Entregado"


class OrigenLlave(models.TextChoices):
    PROGRAMACION = "programacion", "Programación"
    RESERVA_SEMESTRAL = "reserva_semestral", "Reserva semestral"
    RESERVA_INDIVIDUAL = "reserva_individual", "Reserva individual"
    MANUAL = "manual", "Manual"


class TipoEntregaLlave(models.TextChoices):
    CREDENCIAL = "credencial", "Credencial"
    MANUAL = "manual", "Manual"


class Llave(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    salon = models.ForeignKey(Salon, on_delete=models.PROTECT, db_column="salon_id")
    docente_titular = models.ForeignKey(
        Comunidad,
        on_delete=models.PROTECT,
        db_column="docente_titular_id",
        related_name="llaves_como_docente_titular",
    )
    reclamado_por = models.ForeignKey(
        Comunidad,
        on_delete=models.PROTECT,
        db_column="reclamado_por_id",
        related_name="llaves_como_reclamado_por",
    )
    origen = models.CharField(max_length=20, choices=OrigenLlave.choices)
    tipo_entrega = models.CharField(max_length=10, choices=TipoEntregaLlave.choices)
    tipo_devolucion = models.CharField(
        max_length=10, choices=TipoEntregaLlave.choices, null=True, blank=True
    )
    usuario_entrega = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        db_column="usuario_entrega_id",
        related_name="llaves_entregadas",
    )
    usuario_recibe = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        db_column="usuario_recibe_id",
        related_name="llaves_recibidas",
        null=True,
        blank=True,
    )
    ubicacion_entrega = models.ForeignKey(
        Ubicacion,
        on_delete=models.PROTECT,
        db_column="ubicacion_entrega_id",
        related_name="llaves_con_entrega_aqui",
    )
    ubicacion_devolucion = models.ForeignKey(
        Ubicacion,
        on_delete=models.PROTECT,
        db_column="ubicacion_devolucion_id",
        related_name="llaves_con_devolucion_aqui",
        null=True,
        blank=True,
    )
    novedad = models.ForeignKey(
        Novedad,
        on_delete=models.PROTECT,
        db_column="novedad_id",
        null=True,
        blank=True,
    )
    fecha_hora_entrega = models.DateTimeField(auto_now_add=True)
    fecha_hora_devolucion = models.DateTimeField(null=True, blank=True)
    estado = models.CharField(
        max_length=15, choices=EstadoLlave.choices, default=EstadoLlave.EN_PRESTAMO
    )

    class Meta:
        db_table = "llave"
        constraints = [
            models.CheckConstraint(
                check=models.Q(estado__in=EstadoLlave.values),
                name="ck_llave_estado_valido",
            ),
            models.CheckConstraint(
                check=models.Q(origen__in=OrigenLlave.values),
                name="ck_llave_origen_valido",
            ),
            models.CheckConstraint(
                check=models.Q(tipo_entrega__in=TipoEntregaLlave.values),
                name="ck_llave_tipo_entrega_valido",
            ),
            models.CheckConstraint(
                check=models.Q(tipo_devolucion__in=TipoEntregaLlave.values)
                | models.Q(tipo_devolucion__isnull=True),
                name="ck_llave_tipo_devolucion_valido",
            ),
            models.CheckConstraint(
                check=models.Q(fecha_hora_devolucion__isnull=True)
                | models.Q(fecha_hora_devolucion__gt=models.F("fecha_hora_entrega")),
                name="ck_llave_fechas_validas",
            ),
            models.UniqueConstraint(
                fields=["salon"],
                condition=~models.Q(estado=EstadoLlave.ENTREGADO),
                name="idx_llave_activa_unica_por_salon",
            ),
        ]
        indexes = [
            models.Index(fields=["estado"], name="idx_llave_estado"),
        ]

    def __str__(self) -> str:
        return f"Llave de {self.salon_id} ({self.estado})"
