"""
Modelo ORM del módulo novedades.

Este módulo es dueño exclusivo de la tabla `novedad` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, sección "Novedad (antes de
Llave/DetallePrestamo por el FK que reciben)"): registra daños/pérdidas/
otros incidentes reportados sobre llaves o equipos, con un ciclo de vida
simple abierta -> cerrada. El propio comentario del DDL ya documenta por
qué esta tabla se declara ANTES de `llave`/`detalle_prestamo` en el
archivo: ambas tienen un FK opcional `novedad_id` hacia acá
(`llave.novedad_id`, `detalle_prestamo.novedad_id`). Esos módulos
(`llaves`, `prestamos`) todavía no existen en este backend, así que esta
tabla no declara ningún lado de esa relación inversa; cuando se
construyan, sus propios `model.py` importarán `novedades.model.Novedad`
para declarar su `ForeignKey`, mismo patrón ya usado en este proyecto
(p. ej. `usuarios.model` importa `catalogos.model.Rol`/`Ubicacion`).

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4),
nunca la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos consumen novedades exclusivamente a través
de `novedades.service`.

Nota de diseño — FK a `usuarios.model.Usuario`: mismo patrón ya
establecido en `monitores.model` (FK a `comunidad.model.Comunidad`) y en
`usuarios.model` (FK a `catalogos.model.Rol`/`Ubicacion`) — el
`ForeignKey` necesita la clase del modelo ajeno importada acá para
declarar la columna `registrado_por_id`, pero eso NO habilita a
`novedades.repository`/`service` a importar `usuarios.model`
directamente. La validación de que `registrado_por_id` exista pasa por
`usuarios.service.obtener_usuario` (ver `service.py`) — única excepción
documentada del proyecto (importar la clase del modelo ORM ajeno solo
para declarar la columna FK).

Nota de diseño — `on_delete=PROTECT` en `registrado_por`: el DDL declara
`registrado_por_id UUID NOT NULL REFERENCES usuario(id)` sin
`ON DELETE` explícito, que en Postgres equivale a `NO ACTION` — en
espíritu, lo mismo que `PROTECT` de Django (impide borrar un Usuario que
ya registró novedades). Mismo criterio que `usuario.rol`/
`usuario.ubicacion` y `monitor.docente_titular`/`monitor.monitor_
delegado`: ninguna FK sin `ON DELETE CASCADE/SET NULL` explícito en el
DDL se mapea a `PROTECT`, nunca a `CASCADE` (que borraría en silencio
historial de auditoría de incidentes).

Nota de diseño — `categoria_novedad`/`estado_novedad` como
`CharField`+`TextChoices`+`CheckConstraint`, no ENUM nativo de Postgres:
misma convención ya fijada por `equipos.model.EstadoEquipo`/
`monitores.model.DiaSemana` (ver sus propias notas de diseño) — Django
no tiene soporte nativo para `CREATE TYPE ... AS ENUM`; se traduce a
`varchar` + `CHECK` con la misma garantía de integridad observable que
el ENUM nativo del DDL.

Nota de diseño — `estado` con `default='abierta'`: el DDL declara
`estado estado_novedad NOT NULL DEFAULT 'abierta'` — toda novedad nace
abierta; el único camino a `cerrada` es `service.cerrar_novedad`, que
además exige una `solucion` no vacía (ver domain.py) porque no tiene
sentido cerrar un reporte de daño/pérdida sin decir qué se hizo al
respecto. El DDL no impone esa exigencia como constraint de esquema
(permitiría `estado='cerrada'` con `solucion` NULL vía SQL crudo), así
que queda como regla de negocio en la capa de aplicación — igual
criterio que `programacion.domain` valida el solapamiento de horario en
vez de intentar expresarlo como CHECK.

Nota de diseño — `descripcion`/`solucion` como `TextField`: el DDL los
declara `TEXT` (sin límite de longitud), a diferencia de las columnas
`VARCHAR(n)` que sí se mapean a `CharField(max_length=n)` en el resto
del proyecto. `TextField` es el mapeo natural de Django para `TEXT`.

Nota de diseño — sin timestamp de creación: a diferencia de otras
tablas del sistema (p. ej. `llave.fecha_hora_entrega`), el DDL de
`novedad` no declara ninguna columna de fecha/hora. No se agrega una acá
por conveniencia: es fiel al DDL, que es la fuente de verdad de este
módulo (ver instrucciones de la tarea). Si en el futuro hace falta
auditar cuándo se registró/cerró una novedad, es una decisión de negocio
explícita a tomar después, igual criterio que otras "notas de diseño" de
este proyecto sobre no inventar columnas que el DDL no pide.
"""

import uuid

from django.db import models

from usuarios.model import Usuario


class CategoriaNovedad(models.TextChoices):
    DANO = "dano", "Daño"
    PERDIDA = "perdida", "Pérdida"
    OTRO = "otro", "Otro"


class EstadoNovedad(models.TextChoices):
    ABIERTA = "abierta", "Abierta"
    CERRADA = "cerrada", "Cerrada"


class Novedad(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    categoria = models.CharField(max_length=10, choices=CategoriaNovedad.choices)
    descripcion = models.TextField(null=True, blank=True)
    estado = models.CharField(
        max_length=10, choices=EstadoNovedad.choices, default=EstadoNovedad.ABIERTA
    )
    solucion = models.TextField(null=True, blank=True)
    registrado_por = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, db_column="registrado_por_id"
    )

    class Meta:
        db_table = "novedad"
        constraints = [
            models.CheckConstraint(
                check=models.Q(categoria__in=CategoriaNovedad.values),
                name="ck_novedad_categoria_valida",
            ),
            models.CheckConstraint(
                check=models.Q(estado__in=EstadoNovedad.values),
                name="ck_novedad_estado_valido",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.categoria} ({self.estado})"
