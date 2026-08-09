"""
Modelo ORM del módulo prestamos.

Este módulo es dueño exclusivo de TRES tablas relacionadas (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, sección "prestamo"/
"detalle_prestamo"/"devolucion"): `Prestamo` (el préstamo de uno o varios
equipos a la vez, a diferencia de `Llave`, que siempre es un único
salón), `DetallePrestamo` (un renglón por cada equipo dentro de un
préstamo, con su propio estado de entrega/devolución — permite la
devolución PARCIAL) y `Devolucion` (un acto de devolución, puede haber
varias por préstamo si fue parcial en distintos momentos). Es el módulo
más complejo del proyecto hasta ahora: 3 tablas relacionadas en vez de
una sola.

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos, para las 3
tablas.

Regla dura del proyecto: ningún otro módulo debe importar estos modelos
directamente. Otros módulos consumen prestamos exclusivamente a través
de `prestamos.service`.

Nota de diseño — 5 FKs a 4 módulos distintos (`comunidad.model.
Comunidad`, `usuarios.model.Usuario`, `catalogos.model.Ubicacion`,
`equipos.model.Equipo`, `novedades.model.Novedad`), todas con la
excepción documentada de import cross-módulo en `model.py`: mismo
patrón ya establecido en `llaves.model`/`programacion.model`/
`monitores.model`/`novedades.model` — el `ForeignKey` necesita la clase
del modelo ajeno importada acá para declarar la columna, pero eso NO
habilita a `prestamos.repository`/`domain`/`service` a importar esos
`model.py` directamente. Las validaciones de que cada referencia exista
pasan por el `.service` del módulo dueño (ver `service.py`):
`comunidad.service.obtener_persona`, `usuarios.service.obtener_usuario`,
`catalogos.service.obtener_ubicacion`, `equipos.service.obtener_equipo`,
`novedades.service.obtener_novedad`.

Nota de diseño — sin `related_name` explícito en ninguna FK, a
diferencia de `llaves.model.Llave` (que sí necesita varios): cada FK de
este módulo es la ÚNICA hacia su modelo destino DESDE ESE modelo origen
concreto — `Prestamo.usuario_prestamista` es la única FK de `Prestamo` a
`Usuario`, y `Devolucion.usuario_recibe` es la única FK de `Devolucion`
a `Usuario`; como pertenecen a modelos origen distintos, Django no choca
(el accessor inverso por defecto se namespacea por combinación
modelo-origen+modelo-destino: `prestamo_set`/`devolucion_set`, ya
distintos entre sí). El mismo razonamiento aplica a las dos FKs
independientes hacia `Ubicacion` (una en `Prestamo`, otra en
`Devolucion`) y a las dos hacia `Prestamo` (una en `DetallePrestamo`,
otra en `Devolucion`). El conflicto que sí obligó `related_name`
explícito en `llaves.model.Llave` (dos FKs *del mismo modelo* hacia el
mismo destino, p. ej. `docente_titular`/`reclamado_por` -> `Comunidad`)
no se repite en ningún modelo de este módulo.

Nota de diseño — `on_delete`: 4 de las 5 FKs usan `models.PROTECT`
(mismo criterio que el resto del proyecto: el DDL no declara
`ON DELETE` explícito para ellas, que en Postgres equivale a
`NO ACTION` — en espíritu, lo mismo que `PROTECT`). La única excepción
es `DetallePrestamo.prestamo`, que el DDL SÍ declara explícitamente
`ON DELETE CASCADE` — se traduce literal a `models.CASCADE`, no se
homogeniza a `PROTECT` "por consistencia" con el resto de FKs del
proyecto: es una decisión de negocio ya tomada en el DDL (borrar un
préstamo completo debe arrastrar sus detalles, no dejarlos huérfanos ni
bloquear el borrado del préstamo). Nótese que `Devolucion.prestamo` es
una FK DISTINTA, en una tabla distinta, que el DDL NO marca con
`ON DELETE CASCADE` — se mapea a `PROTECT` como el resto, sin heredar
por analogía la decisión tomada solo para `detalle_prestamo`.

Nota de diseño — `EstadoPrestamo`/`EstadoDetalleEquipo` como
`CharField`+`TextChoices`+`CheckConstraint`, no ENUM nativo de Postgres:
misma convención ya fijada por `equipos.model.EstadoEquipo`/
`llaves.model.EstadoLlave` (ver sus propias notas de diseño) — Django no
tiene soporte nativo para `CREATE TYPE ... AS ENUM`; se traduce a
`varchar` + `CHECK` con la misma garantía de integridad observable que
el ENUM nativo del DDL.

Nota de diseño — `fecha_creacion`/`fecha_entrega`/`fecha` con
`auto_now_add=True`: el DDL declara las 3 como
`TIMESTAMPTZ NOT NULL DEFAULT now()`, mismo patrón ya usado en
`llaves.model.Llave.fecha_hora_entrega`/`auth.model.SesionRefresh.
fecha_emision` para la misma semántica de columna ("se llena sola al
crear la fila, nunca se edita después"). `fecha_devolucion` (en
`DetallePrestamo`), en cambio, es un `DateTimeField` normal (nullable):
se llena explícitamente en `service.devolver_equipos` con un
`timezone.now()` calculado UNA vez ahí y pasado a `repository.
marcar_detalle_devuelto`, nunca calculado dentro del repository — mismo
patrón documentado en `llaves.model`/`llaves.repository`/
`auth.repository` (permite testear con un "ahora" fijo y mantiene un
único timestamp consistente por operación de negocio, compartido además
por TODOS los detalles que se devuelven en la misma llamada).

Nota de diseño — CHECK de fechas de `DetallePrestamo` replicado del
DDL, no inventado: el DDL declara `CHECK (fecha_devolucion IS NULL OR
fecha_devolucion > fecha_entrega)`. Se traduce literal a
`CheckConstraint`, mismo patrón que `ck_llave_fechas_validas` en
`llaves.model`.

Nota de diseño — `idx_prestamo_solicitante` (índice DDL sobre una
columna FK) NO se declara como `models.Index` explícito acá: Django ya
crea automáticamente un índice de columna simple sobre toda
`ForeignKey` (comportamiento por defecto, `db_index` implícito) — mismo
criterio ya aplicado a `idx_llave_docente_titular` (ver `llaves.model`,
nota de diseño). `idx_prestamo_estado`, en cambio, SÍ se declara
explícito (`models.Index`) porque `estado` no es una FK — sin la FK
gratis de Django, ese índice no existiría si no se declara.

Nota de diseño — `idx_equipo_entregado_unico` (mismo principio que
`idx_llave_activa_unica_por_salon`, RNF02 de `llaves`: un equipo no
puede estar "entregado" en dos préstamos activos a la vez) como
`UniqueConstraint` condicional: el DDL lo declara como índice único
PARCIAL con condición POSITIVA (`CREATE UNIQUE INDEX ... ON
detalle_prestamo(equipo_id) WHERE estado_equipo = 'entregado'`) — a
diferencia de `idx_llave_activa_unica_por_salon`, cuya condición en el
DDL es NEGATIVA (`WHERE estado != 'entregado'`, traducida en
`llaves.model` a `~Q(estado='entregado')`). Acá se traduce literal con
`condition=Q(estado_equipo=EstadoDetalleEquipo.ENTREGADO)` — la misma
condición positiva del DDL, sin negar — en vez de la forma alternativa
`~Q(estado_equipo='devuelto')`: aunque ambas expresiones son
observacionalmente equivalentes hoy (solo existen 2 valores posibles
para `estado_equipo`, garantizados por el `CheckConstraint` de este
mismo modelo), la traducción literal de la condición TAL COMO aparece
en el DDL no depende de ese invariante de cardinalidad — si
`EstadoDetalleEquipo` alguna vez ganara un tercer valor, la traducción
literal seguiría siendo correcta sin tener que re-derivar la negación.

Nota de diseño — pre-check de disponibilidad en `domain.py`/
`service.py` para `idx_equipo_entregado_unico`, a diferencia de
`llaves.domain`/`service` con `idx_llave_activa_unica_por_salon`:
`llaves` NO agrega una validación previa para "salón ya con llave
activa" y deja que el `UniqueConstraint` de BD lo capture como
`IntegrityError` crudo (ver la nota de diseño equivalente en
`llaves.model`: es una condición de carrera entre requests
concurrentes, no una regla anticipable de forma útil). Este módulo SÍ
agrega una validación explícita antes de insertar (ver
`domain.validar_equipo_disponible` + `service.crear_prestamo`) — no es
una divergencia arbitraria de criterio frente a `llaves`:
`equipos.service` (ver su propio docstring) delega EXPLÍCITAMENTE a
`prestamos` la responsabilidad de calcular la "disponibilidad real" de
un equipo (descontando los ya prestados) — una responsabilidad de
negocio que ningún módulo le delegó nunca a `llaves` de forma análoga
para `salon`. Cumplir una responsabilidad ya asignada en la
documentación de otro módulo justifica el pre-check explícito acá: no
es "inventar" una regla nueva, es completar una que otro módulo ya
declaró como propia de éste. El `UniqueConstraint` de BD se mantiene de
todos modos como garantía final contra la condición de carrera entre
dos requests concurrentes — el pre-check en Python, con una consulta
previa no atómica, no puede garantizar eso por sí solo. Ambas capas
coexisten, no son mutuamente excluyentes.
"""

import uuid

from django.db import models

from catalogos.model import Ubicacion
from comunidad.model import Comunidad
from equipos.model import Equipo
from novedades.model import Novedad
from usuarios.model import Usuario


class EstadoPrestamo(models.TextChoices):
    ACTIVO = "activo", "Activo"
    PARCIALMENTE_DEVUELTO = "parcialmente_devuelto", "Parcialmente devuelto"
    COMPLETAMENTE_DEVUELTO = "completamente_devuelto", "Completamente devuelto"


class EstadoDetalleEquipo(models.TextChoices):
    ENTREGADO = "entregado", "Entregado"
    DEVUELTO = "devuelto", "Devuelto"


class Prestamo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitante = models.ForeignKey(
        Comunidad, on_delete=models.PROTECT, db_column="solicitante_id"
    )
    usuario_prestamista = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, db_column="usuario_prestamista_id"
    )
    ubicacion = models.ForeignKey(
        Ubicacion, on_delete=models.PROTECT, db_column="ubicacion_id"
    )
    estado = models.CharField(
        max_length=22, choices=EstadoPrestamo.choices, default=EstadoPrestamo.ACTIVO
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "prestamo"
        constraints = [
            models.CheckConstraint(
                check=models.Q(estado__in=EstadoPrestamo.values),
                name="ck_prestamo_estado_valido",
            ),
        ]
        indexes = [
            models.Index(fields=["estado"], name="idx_prestamo_estado"),
        ]

    def __str__(self) -> str:
        return f"Prestamo {self.id} ({self.estado})"


class DetallePrestamo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prestamo = models.ForeignKey(
        Prestamo, on_delete=models.CASCADE, db_column="prestamo_id"
    )
    equipo = models.ForeignKey(
        Equipo, on_delete=models.PROTECT, db_column="equipo_id"
    )
    novedad = models.ForeignKey(
        Novedad,
        on_delete=models.PROTECT,
        db_column="novedad_id",
        null=True,
        blank=True,
    )
    estado_equipo = models.CharField(
        max_length=10,
        choices=EstadoDetalleEquipo.choices,
        default=EstadoDetalleEquipo.ENTREGADO,
    )
    fecha_entrega = models.DateTimeField(auto_now_add=True)
    fecha_devolucion = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "detalle_prestamo"
        constraints = [
            models.CheckConstraint(
                check=models.Q(estado_equipo__in=EstadoDetalleEquipo.values),
                name="ck_detalle_prestamo_estado_valido",
            ),
            models.CheckConstraint(
                check=models.Q(fecha_devolucion__isnull=True)
                | models.Q(fecha_devolucion__gt=models.F("fecha_entrega")),
                name="ck_detalle_prestamo_fechas_validas",
            ),
            models.UniqueConstraint(
                fields=["equipo"],
                condition=models.Q(estado_equipo=EstadoDetalleEquipo.ENTREGADO),
                name="idx_equipo_entregado_unico",
            ),
        ]

    def __str__(self) -> str:
        return f"DetallePrestamo {self.equipo_id} de {self.prestamo_id} ({self.estado_equipo})"


class Devolucion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prestamo = models.ForeignKey(
        Prestamo, on_delete=models.PROTECT, db_column="prestamo_id"
    )
    usuario_recibe = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, db_column="usuario_recibe_id"
    )
    ubicacion = models.ForeignKey(
        Ubicacion, on_delete=models.PROTECT, db_column="ubicacion_id"
    )
    fecha = models.DateTimeField(auto_now_add=True)
    es_completa = models.BooleanField(default=False)

    class Meta:
        db_table = "devolucion"

    def __str__(self) -> str:
        return f"Devolucion {self.id} de {self.prestamo_id} (completa={self.es_completa})"
