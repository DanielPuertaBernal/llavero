"""
Modelo ORM del módulo reservas_semestrales.

Este módulo es dueño exclusivo de la tabla `reserva_semestral` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, sección "Reservas"): una franja
horaria recurrente semanal, no oficial (p. ej. un semillero, un club),
vigente durante un semestre. Se releyó el DDL completo antes de modelar (no
solo el resumen recibido) — la sección "Reservas" declara dos tablas
distintas, `reserva_semestral` y `reserva_individual`; este módulo NO es
dueño de `reserva_individual` (esa tabla usa `fecha`+`estado`, no
`dia_semana`/`semestre_id`/`grupo_id`, y pertenece al módulo aparte
`reservas`, ver la nota de diseño simétrica en `reservas/model.py`) — no se
confunden pese a compartir sección en el DDL y un prefijo de nombre.

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4), nunca
la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos consumen reservas_semestrales exclusivamente a
través de `reservas_semestrales.service`.

Nota de diseño — FK a `catalogos.model.Salon`, `comunidad.model.Comunidad` y
`programacion.model.Semestre`: mismo patrón ya establecido en
`reservas.model`/`programacion.model` — el `ForeignKey` necesita la clase
del modelo ajeno importada acá para declarar la columna, pero eso NO
habilita a `reservas_semestrales.repository`/`domain`/`service` a importar
`catalogos.model`/`comunidad.model`/`programacion.model` directamente. La
validación de que `salon_id` exista pasa por
`catalogos.service.obtener_salon`, la de `solicitante_id` por
`comunidad.service.obtener_persona`, y la de `semestre_id` por
`programacion.service.obtener_semestre` (ver `service.py`).

Nota de diseño — `on_delete=PROTECT` en las 3 FKs: el DDL no declara
`ON DELETE` explícito en ninguna, que en Postgres equivale a `NO ACTION` —
en espíritu, lo mismo que `PROTECT` de Django. Mismo criterio ya aplicado a
`reservas.model.ReservaIndividual`/`programacion.model.Programacion`.

Nota de diseño — `DiaSemana` propio, NO reusado de `programacion.model` (ni
de `reservas.model`, que no lo tiene): mismo razonamiento ya documentado
completo en `monitores/model.py` — la única excepción a la regla dura
"ningún módulo importa el `model.py` de otro directamente" es importar la
CLASE de un modelo ORM ajeno para declarar una columna `ForeignKey`. Un
`TextChoices` no es esa excepción: no es una FK, es un enum de valores sin
ninguna relación de dato real que justifique acoplar el ciclo de vida de
este módulo al de `programacion`. Se redefine localmente con los mismos 7
valores del DDL (`dia_semana`), igual convención `CharField`+`choices`+
`CheckConstraint` que `programacion.model.DiaSemana`/
`monitores.model.DiaSemana` — no se valida con el ENUM nativo de Postgres,
sigue la convención ya fijada en el proyecto (Django no soporta
`CREATE TYPE ... AS ENUM` nativo).

Nota de diseño — `grupo_id` es un `UUIDField` simple, SIN
`default=uuid.uuid4`: a diferencia de `id` (que cada fila genera su propio
valor al crearse), `grupo_id` es compartido por TODAS las franjas creadas
en una misma solicitud (ver `service.crear_grupo_reservas_semestrales`) —
se genera UNA sola vez en `service.py` con `uuid.uuid4()` y se pasa
explícito a cada fila del grupo, nunca lo genera el modelo ni la base de
datos. Existe el índice `idx_reserva_semestral_grupo` (no único: varias
filas comparten el mismo `grupo_id` por diseño) para que
`listar_por_grupo`/`cancelar_grupo` sean eficientes.

Nota de diseño — `creado_manualmente` (`BooleanField(default=True)`, fiel
al DDL `NOT NULL DEFAULT true`): distingue una franja creada por un usuario
desde la UI (`true`, cancelable vía API) de una cargada institucionalmente
en lote (`false`, NO cancelable vía API — ver
`service.cancelar_grupo`).

Nota de diseño — SIN columna `estado`: a diferencia de `reserva_individual`
(que sí tiene `EstadoReservaIndividual` con ciclo de vida
aprobada/cancelada/completada/no_reclamada), el DDL de `reserva_semestral`
no declara ninguna columna de estado — no hay ciclo de vida que modelar.
"Cancelar" en este módulo (`service.cancelar_grupo`) es un DELETE real de
las filas del grupo, no una transición de estado; no se agrega una columna
que el DDL no pide.

Nota de diseño — nombres de índice acortados por el límite de 30
caracteres de `models.Index.max_name_length` (restricción propia de
Django para portabilidad entre motores, NO del DDL/Postgres, que sí
acepta hasta 63 — mismo gotcha ya documentado en
`reservas/model.py`/`llaves/model.py`):
- `idx_reserva_semestral_salon_dia` del DDL literal (32 caracteres) EXCEDE
  el límite → se acorta a `idx_reserva_sem_salon_dia` (25 caracteres).
- `idx_reserva_semestral_grupo` del DDL literal (27 caracteres) SÍ cabe sin
  modificar.
El nombre físico del primer índice difiere del literal del DDL, pero el
índice resultante (mismas columnas `salon_id`+`dia`, mismo tipo B-tree por
defecto) es funcionalmente idéntico.

Nota de diseño — CHECK `hora_inicio < hora_fin` replicado literal del DDL:
mismo patrón que `ck_reserva_individual_horario_valido`
(`reservas.model`)/`ck_programacion_horario_valido`
(`programacion.model`) — comparación de dos columnas de la misma fila con
`models.F()`.

Nota de diseño — SIN `UniqueConstraint`: se releyó el DDL completo de esta
tabla y `reserva_semestral` no declara ningún índice único, parcial o no —
solo el CHECK de horario y los dos índices no-únicos ya mencionados. El
no-solapamiento de horarios (contra otras `reserva_semestral` del mismo
salón/día, y contra `Programacion` del mismo salón/día) es una regla de
NEGOCIO validada en `domain.py`/`service.py`, no una restricción de
esquema — mismo criterio ya aplicado en `reservas.model`/
`programacion.model` con `hay_solapamiento`.
"""

import uuid

from django.db import models

from catalogos.model import Salon
from comunidad.model import Comunidad
from programacion.model import Semestre


class DiaSemana(models.TextChoices):
    LUNES = "lunes", "Lunes"
    MARTES = "martes", "Martes"
    MIERCOLES = "miercoles", "Miércoles"
    JUEVES = "jueves", "Jueves"
    VIERNES = "viernes", "Viernes"
    SABADO = "sabado", "Sábado"
    DOMINGO = "domingo", "Domingo"


class ReservaSemestral(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    salon = models.ForeignKey(Salon, on_delete=models.PROTECT, db_column="salon_id")
    solicitante = models.ForeignKey(
        Comunidad, on_delete=models.PROTECT, db_column="solicitante_id"
    )
    semestre = models.ForeignKey(
        Semestre, on_delete=models.PROTECT, db_column="semestre_id"
    )
    dia = models.CharField(max_length=10, choices=DiaSemana.choices)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    grupo_id = models.UUIDField()
    creado_manualmente = models.BooleanField(default=True)

    class Meta:
        db_table = "reserva_semestral"
        constraints = [
            models.CheckConstraint(
                check=models.Q(dia__in=DiaSemana.values),
                name="ck_reserva_semestral_dia_valido",
            ),
            models.CheckConstraint(
                check=models.Q(hora_inicio__lt=models.F("hora_fin")),
                name="ck_reserva_semestral_horario_valido",
            ),
        ]
        indexes = [
            models.Index(fields=["salon", "dia"], name="idx_reserva_sem_salon_dia"),
            models.Index(fields=["grupo_id"], name="idx_reserva_semestral_grupo"),
        ]

    def __str__(self) -> str:
        return f"ReservaSemestral {self.salon_id} {self.dia} ({self.hora_inicio}-{self.hora_fin})"
