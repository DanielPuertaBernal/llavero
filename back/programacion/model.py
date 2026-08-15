"""
Modelos ORM del módulo programacion.

Este módulo es dueño exclusivo de las tablas: semestre, programacion (ver
DDL en DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql). El UUID de cada PK lo
genera el backend en Python (default=uuid.uuid4), nunca la base de datos,
igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar estos modelos
directamente. Los futuros módulos `reservas`/`reservas_semestrales`/
`llaves` consumen programacion exclusivamente a través de
`programacion.service`.

Nota de diseño — `semestre` vive acá, no en `catalogos`: el DDL solo
agrupa `semestre` físicamente cerca de `salon` bajo el comentario
"Espacios", pero la ownership real es de programación académica (en el
sistema legacy, `semestre` vivía en el feature `programacion`, con su
propio repository consumido por `reservas_semestrales`). `catalogos` ya
fijó su alcance a las 6 entidades documentadas en su propio model.py
(rol, tipo_persona, ubicacion, bloque, tipo_silleteria, salon); agregar
`semestre` ahí mezclaría un concepto de calendario académico con
catálogos de datos maestros sin relación entre sí. Este módulo posee la
tabla, la valida y la expone vía `service.obtener_semestre`/
`crear_semestre` para que otros módulos (`programacion` mismo,
`reservas_semestrales` en el futuro) la consuman igual que consumen
`catalogos.service.obtener_salon`.

Nota de diseño — FK a `catalogos.model.Salon` y `comunidad.model.Comunidad`:
mismo patrón ya establecido en `comunidad.model.Comunidad` con
`TipoPersona` — el `ForeignKey` necesita la clase del modelo importada
acá para declarar la columna, pero eso no habilita a
`programacion.repository`/`service` a importar `catalogos.model`/
`comunidad.model` directamente. La validación de que `salon_id` exista
pasa por `catalogos.service.obtener_salon`, y la de `docente_id` (cuando
no es `None`, ver nota siguiente) por `comunidad.service.obtener_persona`
(ver `service.py`). `semestre_id` no cruza módulos: se valida contra este
mismo módulo (`repository.obtener_semestre_por_id`).

Nota de diseño — `docente` con `null=True, blank=True` (divergencia
deliberada del DDL original, que lo declaraba `NOT NULL`): un Excel real
de programación (ver `excel_import.py`/AulaSync `programacion.service.js`,
comentario "Si tiene salón pero sin docente asignado, se incluye con
valor por defecto") a veces trae filas con `salon`/`dia`/`horario` ya
confirmados pero SIN un docente todavía asignado (el proceso de asignación
docente-materia de la facultad suele cerrarse después de que el salón y
el horario ya están fijados). Si `docente_id` siguiera siendo `NOT NULL`,
la única opción sería descartar esa fila del import — perdiendo el
registro de que ese salón/horario YA está ocupado. Eso es un riesgo real:
una `ReservaIndividual`/`ReservaSemestral` que se cree después contra ese
mismo salón/día/horario (antes de que el docente se confirme y la fila se
reimporte) no chocaría contra nada en `programacion`, permitiendo un
doble-booking del salón que el propio RF15 (validación cruzada de las 3
fuentes) existe para evitar. Por eso se prefiere crear la fila con
`docente_id=None` (bloqueando el salón/horario desde ya) y permitir
asignar el docente después vía edición manual, en vez de perder la franja
por completo.

Nota de diseño — `dia_semana`: el DDL lo declara como tipo ENUM nativo de
Postgres. Igual que `equipos.model.EstadoEquipo` (ver ese módulo para el
razonamiento completo), se representa como `CharField` con `choices`
restringidas a los 7 valores del DDL más un `CheckConstraint` a nivel de
base de datos que reproduce la misma garantía de integridad que da el
ENUM nativo. Es una divergencia deliberada de la forma literal del DDL
(varchar+check en vez de tipo enum nativo), no una omisión de la regla de
negocio.
"""

import uuid

from django.db import models

from catalogos.model import Salon
from comunidad.model import Comunidad


class DiaSemana(models.TextChoices):
    LUNES = "lunes", "Lunes"
    MARTES = "martes", "Martes"
    MIERCOLES = "miercoles", "Miércoles"
    JUEVES = "jueves", "Jueves"
    VIERNES = "viernes", "Viernes"
    SABADO = "sabado", "Sábado"
    DOMINGO = "domingo", "Domingo"


class Semestre(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=10, unique=True)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()

    class Meta:
        db_table = "semestre"
        constraints = [
            models.CheckConstraint(
                check=models.Q(fecha_inicio__lt=models.F("fecha_fin")),
                name="ck_semestre_fechas_validas",
            )
        ]

    def __str__(self) -> str:
        return self.codigo


class Programacion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    salon = models.ForeignKey(Salon, on_delete=models.PROTECT, db_column="salon_id")
    docente = models.ForeignKey(
        Comunidad,
        on_delete=models.PROTECT,
        db_column="docente_id",
        null=True,
        blank=True,
    )
    semestre = models.ForeignKey(Semestre, on_delete=models.PROTECT, db_column="semestre_id")
    dia = models.CharField(max_length=10, choices=DiaSemana.choices)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    materia = models.CharField(max_length=150)

    class Meta:
        db_table = "programacion"
        constraints = [
            models.CheckConstraint(
                check=models.Q(dia__in=DiaSemana.values),
                name="ck_programacion_dia_valido",
            ),
            models.CheckConstraint(
                check=models.Q(hora_inicio__lt=models.F("hora_fin")),
                name="ck_programacion_horario_valido",
            ),
        ]
        indexes = [
            models.Index(fields=["salon", "dia"], name="idx_programacion_salon_dia"),
        ]

    def __str__(self) -> str:
        return f"{self.materia} ({self.dia} {self.hora_inicio}-{self.hora_fin})"
