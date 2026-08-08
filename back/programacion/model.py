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
pasa por `catalogos.service.obtener_salon`, y la de `docente_id` por
`comunidad.service.obtener_persona` (ver `service.py`). `semestre_id` no
cruza módulos: se valida contra este mismo módulo
(`repository.obtener_semestre_por_id`).

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
    docente = models.ForeignKey(Comunidad, on_delete=models.PROTECT, db_column="docente_id")
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
