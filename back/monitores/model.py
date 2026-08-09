"""
Modelo ORM del módulo monitores.

Este módulo es dueño exclusivo de la tabla `monitor` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql): una tabla de delegación —
vincula a un estudiante (monitor delegado) con un docente titular para
una materia concreta, con aula/día/horario opcionales. El consumidor
real de esta lógica es el futuro módulo `llaves` (resolución de
identidad por NFC: "si la persona escaneada no tiene clase propia hoy,
¿es monitor delegado de alguien que sí la tiene?"), que debe consumir
`monitores.service` exclusivamente — nunca este `model.py`.

Nota de diseño — dos FK a `comunidad.model.Comunidad` desde la misma
tabla: mismo patrón ya establecido en `programacion.model` (FK a
`catalogos.model.Salon`/`comunidad.model.Comunidad`) — el `ForeignKey`
necesita la clase del modelo importada acá para declarar la columna,
pero eso no habilita a `monitores.repository`/`service` a importar
`comunidad.model` directamente. La validación de que
`docente_titular_id`/`monitor_delegado_id` existan pasa por
`comunidad.service.obtener_persona` (ver `service.py`). Al ser dos FKs
distintas apuntando a la misma tabla, cada una necesita su propio
`related_name` explícito (si no, Django choca con el accessor inverso
por defecto `monitor_set` compartido) — se usan nombres descriptivos que
documentan el rol de cada lado de la delegación.

Nota de diseño — `DiaSemana` propio, no reusado de `programacion.model`:
se evaluó importar `programacion.model.DiaSemana` (mismos 7 valores) en
vez de redefinirla acá, pero se descartó porque la regla dura del
proyecto ("ningún otro módulo debe importar el `model.py` de otro
directamente") solo tiene una excepción documentada y acotada: importar
la clase de un modelo ORM ajeno para declarar una columna `ForeignKey`
(ver notas de diseño en `comunidad.model`/`programacion.model`). Un
`TextChoices` no es esa excepción — no es una FK, es un enum de valores
que además acá tiene una semántica distinta (nullable, ver abajo).
Acoplar `monitores.model` a un símbolo cualquiera de `programacion.model`
solo para no repetir 7 líneas crearía una dependencia estructural entre
dos módulos dueños de tablas distintas, sin ninguna FK real que la
justifique, y ataría el enum de `monitores` al ciclo de vida de un
módulo que no lo posee. Se redefine localmente con los mismos 7 valores
del DDL (`dia_semana`), igual convención `CharField`+`choices`+
`CheckConstraint` que `programacion.model.DiaSemana`/
`equipos.model.EstadoEquipo` — no se valida con el ENUM nativo de
Postgres, sigue la convención ya fijada en el proyecto.

Nota de diseño — `dia` NULLABLE (a diferencia de `programacion.dia`, que
es NOT NULL): el DDL de `monitor` declara `dia dia_semana` sin
`NOT NULL` — una monitoría puede no tener día fijo (delegación abierta a
cualquier día en que el docente titular tenga clase). El
`CheckConstraint` se ajusta a esa nulabilidad: acepta cualquier valor de
`DiaSemana.values` O `NULL`, en vez de solo los 7 valores como en
`programacion`.

Nota de diseño — `CHECK (docente_titular_id != monitor_delegado_id)`:
el DDL declara esta constraint para impedir que alguien sea monitor de
sí mismo. Se replica acá como `CheckConstraint`, mismo patrón que todos
los CHECK del DDL en este proyecto (ver `ck_equipo_estado_valido`,
`ck_programacion_horario_valido`, `ck_semestre_fechas_validas`) — no es
"reinventar" una constraint nueva, es la traducción a Django de la que
ya existe en el DDL. `service.crear_monitor` la anticipa con una
validación en `domain.py` para devolver un `ValueError` claro en vez de
dejar propagar el `IntegrityError` crudo (ver domain.py).

Nota de diseño — sin campos desnormalizados: a diferencia del legacy
(que copiaba `nombre_docente`/`nombre_monitor`/`id_carnet_monitor`/
`facultad_monitor`/`correo_monitor` al registrar, y nunca los
resincronizaba si cambiaban en `comunidad` — bug de datos obsoletos, ver
AulaSync/analisis/backend/monitores.md §7), el DDL nuevo no tiene esos
campos: son FKs limpias a `comunidad`, cualquier dato de la persona se
consulta en vivo vía `comunidad.service`. No se agregan de vuelta acá.

Nota de diseño — sin índice único: el legacy tenía un índice único
`(docente, monitor, materia, dia, horario)` sin considerar `activo`, lo
que rompía al reactivar una monitoría con la misma combinación tras un
soft-delete (`activo=false`) — ver monitores.md §7. El DDL nuevo no
declara ningún índice único para esta tabla; no se inventa uno acá. Si
en el futuro hace falta, es una decisión de negocio explícita a tomar
después.

Nota de diseño — `activo` con soft-delete: mismo patrón que
`usuarios.model.Usuario` (`activo = BooleanField(default=True)`) —
"eliminar" una monitoría es `activo=false`, nunca un DELETE físico (ver
`service.desactivar_monitor`).
"""

import uuid

from django.db import models

from comunidad.model import Comunidad


class DiaSemana(models.TextChoices):
    LUNES = "lunes", "Lunes"
    MARTES = "martes", "Martes"
    MIERCOLES = "miercoles", "Miércoles"
    JUEVES = "jueves", "Jueves"
    VIERNES = "viernes", "Viernes"
    SABADO = "sabado", "Sábado"
    DOMINGO = "domingo", "Domingo"


class Monitor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    docente_titular = models.ForeignKey(
        Comunidad,
        on_delete=models.PROTECT,
        db_column="docente_titular_id",
        related_name="monitorias_como_docente_titular",
    )
    monitor_delegado = models.ForeignKey(
        Comunidad,
        on_delete=models.PROTECT,
        db_column="monitor_delegado_id",
        related_name="monitorias_como_monitor_delegado",
    )
    materia = models.CharField(max_length=150)
    aula = models.CharField(max_length=30, null=True, blank=True)
    dia = models.CharField(
        max_length=10, choices=DiaSemana.choices, null=True, blank=True
    )
    horario = models.CharField(max_length=30, null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "monitor"
        constraints = [
            models.CheckConstraint(
                check=models.Q(dia__in=DiaSemana.values) | models.Q(dia__isnull=True),
                name="ck_monitor_dia_valido",
            ),
            models.CheckConstraint(
                check=~models.Q(docente_titular_id=models.F("monitor_delegado_id")),
                name="ck_monitor_docente_distinto_de_monitor",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.materia} ({self.docente_titular_id} -> {self.monitor_delegado_id})"
