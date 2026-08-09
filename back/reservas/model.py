"""
Modelo ORM del módulo reservas.

Este módulo es dueño exclusivo de la tabla `reserva_individual` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, sección "Reservas"): una reserva
puntual de un salón por una persona de comunidad, para una fecha y franja
horaria concretas. Se verificó el DDL completo antes de modelar (no solo el
resumen recibido) — la sección "Reservas" declara dos tablas distintas,
`reserva_semestral` y `reserva_individual`; este módulo NO es dueño de
`reserva_semestral` (esa tabla usa `dia_semana`/`semestre_id`/`grupo_id`,
no `fecha`, y pertenece al futuro módulo aparte `reservas_semestrales`) —
no se confunden pese a compartir sección en el DDL y un prefijo de nombre.

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4), nunca
la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos consumen reservas exclusivamente a través de
`reservas.service`.

Nota de diseño — dependencia UNIDIRECCIONAL `llaves` -> `reservas`, NUNCA al
revés: se acordó explícitamente que `llaves.service.crear_llave` importe y
llame a `reservas.service.obtener_reserva`/`completar_reserva` para
completar la reserva asociada al entregarse la llave (ver la nota de diseño
completa en `llaves/service.py`, que documenta el porqué de esa dirección:
romper el ciclo `llaves<->reservas` sin señales de Django ni un
orquestador nuevo, apoyándose únicamente en la dirección de import ya
usada en todo el proyecto — el módulo "consumidor" importa el `.service`
del módulo "dueño", nunca al revés). Por eso este módulo (`reservas`)
NUNCA debe importar nada de `llaves` (ni `.service` ni `.model`), ni
siquiera para un caso de uso aparentemente razonable ("saber si esta
reserva ya tiene una llave asociada"): si en el futuro `reservas` necesita
ese dato, la solución correcta es que `llaves` se lo pase como parámetro
explícito, no agregar el import inverso.

Nota de diseño — FK a `catalogos.model.Salon` y `comunidad.model.Comunidad`:
mismo patrón ya establecido en `programacion.model`/`llaves.model` — el
`ForeignKey` necesita la clase del modelo ajeno importada acá para declarar
la columna, pero eso NO habilita a `reservas.repository`/`domain`/`service`
a importar `catalogos.model`/`comunidad.model` directamente. La validación
de que `salon_id` exista pasa por `catalogos.service.obtener_salon`, y la
de `solicitante_id` por `comunidad.service.obtener_persona` (ver
`service.py`).

Nota de diseño — `on_delete=PROTECT` en ambas FKs: el DDL no declara
`ON DELETE` explícito en ninguna, que en Postgres equivale a `NO ACTION` —
en espíritu, lo mismo que `PROTECT` de Django. Mismo criterio ya aplicado a
`programacion.model.Programacion.salon`/`docente` y a las 7 FKs de
`llaves.model.Llave`.

Nota de diseño — `estado_reserva_individual` como `CharField`+
`TextChoices`+`CheckConstraint`, no ENUM nativo de Postgres: misma
convención ya fijada por `llaves.model.EstadoLlave`/`OrigenLlave` (ver esa
nota de diseño completa) — Django no tiene soporte nativo para
`CREATE TYPE ... AS ENUM`; se traduce a `varchar` + `CHECK` con la misma
garantía de integridad observable que el ENUM nativo del DDL.

Nota de diseño — CHECK `hora_inicio < hora_fin` replicado literal del DDL:
mismo patrón que `ck_programacion_horario_valido`
(`programacion.model`)/`ck_llave_fechas_validas` (`llaves.model`) —
comparación de dos columnas de la misma fila con `models.F()`.

Nota de diseño — `motivo` es `CharField(max_length=255, null=True)`: el DDL
declara `motivo VARCHAR(255)` sin `NOT NULL`, a diferencia de `materia` en
`programacion` (`VARCHAR(150) NOT NULL`) — se traduce fiel como columna
opcional.

Nota de diseño — `idx_reserva_individual_salon_fecha` (índice DDL sobre
`(salon_id, fecha)`) SÍ se declara explícito (`models.Index`): a diferencia
de un índice de columna FK simple (que Django crea gratis sobre `salon`),
este es un índice COMPUESTO sobre `salon` + `fecha` que Django no crea
automáticamente. Mismo criterio que `idx_programacion_salon_dia` en
`programacion.model`.

Nota de diseño — el nombre del índice se acorta a
`idx_reserva_indiv_salon_fecha` (29 caracteres) en vez del literal del DDL
`idx_reserva_individual_salon_fecha` (34 caracteres): `models.Index.
max_name_length` es 30 en Django (una restricción propia de Django para
portabilidad entre motores, no del DDL/Postgres, que sí acepta hasta 63) —
`makemigrations`/el system check (`models.E034`) rechaza cualquier nombre
más largo. Esta restricción de 30 caracteres NO aplica a
`CheckConstraint`/`UniqueConstraint` (ver `ck_reserva_individual_estado_
valido`, 35 caracteres, en las `constraints` de abajo, y compárese con
`idx_llave_activa_unica_por_salon`, un `UniqueConstraint` de 32 caracteres
en `llaves.model`, que sí es válido) — es una limitación específica de
`models.Index`. El nombre físico en la base de datos difiere del literal
del DDL, pero el índice resultante (mismas columnas, mismo tipo B-tree por
defecto) es funcionalmente idéntico.

Nota de diseño — SIN `UniqueConstraint` condicional tipo
`idx_llave_activa_unica_por_salon`: se releyó el DDL completo de esta
tabla (ver instrucciones de esta tarea sobre el precedente de un resumen
incompleto en `llaves`) y `reserva_individual` NO declara ningún índice
único, parcial o no — solo el CHECK de horario y el índice no-único
`idx_reserva_individual_salon_fecha` ya mencionado. El no-solapamiento de
horarios para el mismo salón/fecha es una regla de NEGOCIO validada en
`domain.py`/`service.py`, no una restricción de esquema: dos reservas con
estados distintos (una `cancelada`) pueden compartir horario sin problema,
algo que un CHECK/índice a nivel de una sola fila no puede expresar sin
conocer el estado de OTRAS filas — misma distinción que ya aplica
`programacion` con `programacion.domain.hay_solapamiento` frente al CHECK
de horario, que sí es expresable a nivel de fila.
"""

import uuid

from django.db import models

from catalogos.model import Salon
from comunidad.model import Comunidad


class EstadoReservaIndividual(models.TextChoices):
    APROBADA = "aprobada", "Aprobada"
    CANCELADA = "cancelada", "Cancelada"
    COMPLETADA = "completada", "Completada"
    NO_RECLAMADA = "no_reclamada", "No reclamada"


class ReservaIndividual(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    salon = models.ForeignKey(Salon, on_delete=models.PROTECT, db_column="salon_id")
    solicitante = models.ForeignKey(
        Comunidad, on_delete=models.PROTECT, db_column="solicitante_id"
    )
    fecha = models.DateField()
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    motivo = models.CharField(max_length=255, null=True, blank=True)
    estado = models.CharField(
        max_length=15,
        choices=EstadoReservaIndividual.choices,
        default=EstadoReservaIndividual.APROBADA,
    )

    class Meta:
        db_table = "reserva_individual"
        constraints = [
            models.CheckConstraint(
                check=models.Q(estado__in=EstadoReservaIndividual.values),
                name="ck_reserva_individual_estado_valido",
            ),
            models.CheckConstraint(
                check=models.Q(hora_inicio__lt=models.F("hora_fin")),
                name="ck_reserva_individual_horario_valido",
            ),
        ]
        indexes = [
            models.Index(
                fields=["salon", "fecha"], name="idx_reserva_indiv_salon_fecha"
            ),
        ]

    def __str__(self) -> str:
        return f"Reserva {self.salon_id} {self.fecha} ({self.hora_inicio}-{self.hora_fin})"
