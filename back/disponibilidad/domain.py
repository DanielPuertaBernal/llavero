"""
domain.py — lógica de negocio pura del módulo disponibilidad (sin DB, sin
I/O).

Este módulo no tiene tabla propia ni modelo ORM (ver docstring de
`apps.py`): no hay ningún CHECK/constraint del DDL que proteger acá — es
simplemente donde vive la lógica pura, testeable sin base de datos, que
`service.consultar_disponibilidad_salon` usa para (a) mapear una `fecha`
concreta al día de la semana que le corresponde, y (b) decidir si dos
franjas horarias de fuentes distintas se solapan.

`DIAS_SEMANA`/`dia_semana_de_fecha`: mismos 7 valores y mismo mapeo que
`nfc.domain.DIAS_SEMANA`/`dia_semana_actual` (que a su vez siguen la misma
convención que `programacion.model.DiaSemana`/`reservas_semestrales.model.
DiaSemana`/`monitores.model.DiaSemana`), redefinidos acá localmente en vez
de importados — mismo criterio ya fijado en esos módulos: un `TextChoices`
no es la excepción documentada de este proyecto para importar el
`model.py` de otro módulo (esa excepción es únicamente declarar una
columna `ForeignKey`), y `disponibilidad`, igual que `nfc`, ni siquiera
tiene un `model.py` propio donde "vivir" ese acoplamiento.

Nota de diseño — `hay_solapamiento`: mismo criterio
`hora_inicio_a < hora_fin_b and hora_inicio_b < hora_fin_a` ya usado en
`reservas.domain.hay_solapamiento`/`programacion.domain.hay_solapamiento`/
`reservas_semestrales.domain.hay_solapamiento` — la MISMA lógica pura
triplicada deliberadamente en esos tres módulos (ver la nota de diseño
completa en `reservas/domain.py`: se prefiere una duplicación de 3 líneas
de lógica pura antes que acoplar dos módulos que hoy no tienen ninguna
razón de negocio real para conocerse). Acá se reimplementa una CUARTA vez,
pero por una razón distinta y más fuerte a la de esos tres: `disponibilidad`
es justamente el único módulo cuya razón de ser (RF14/RF15, ver docstring
de `apps.py`) es conocer a las tres fuentes a la vez y comparar sus franjas
entre sí — no hay "acoplamiento a evitar" que justifique, porque este
módulo ya depende explícitamente de `programacion.service`/
`reservas_semestrales.service`/`reservas.service`. Aun así se reimplementa
en vez de importar `hay_solapamiento` desde cualquiera de esos tres
`domain.py`: ninguno de ellos la expone vía su `.service` (es un detalle
interno de cada módulo, ver sus propios docstrings — `existe_solapamiento_
en_salon`/`existe_solapamiento_en_salon_semestral` sí están expuestas, pero
comparan contra SU PROPIA fuente únicamente, no sirven para comparar dos
franjas arbitrarias ya traídas de fuentes distintas), y la regla dura del
proyecto ("un módulo consume a otro solo vía su `.service`, nunca vía
`.model`/`.repository`/`.domain`") no hace ninguna excepción para
`domain.py` — 3 líneas de lógica pura duplicadas una vez más es más barato
que la primera excepción a esa regla en todo el proyecto.
"""

import datetime

DIAS_SEMANA = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
]


def dia_semana_de_fecha(fecha: datetime.date) -> str:
    """Mapea `fecha.weekday()` (convención de Python: 0=lunes ...
    6=domingo, la misma que usa `datetime.date`) al string correspondiente,
    con los mismos 7 valores que el resto del proyecto usa para la columna
    `dia`/`dia_semana` (ver `DIAS_SEMANA` arriba).

    A diferencia de `nfc.domain.dia_semana_actual` (que recibe un
    datetime/date "ahora" y exige que el caller ya lo haya convertido a
    hora LOCAL si viene de `timezone.now()`), acá el parámetro es siempre
    un `datetime.date` puro (la `fecha` de una `ReservaIndividual`, o el
    filtro `fecha` que recibe `consultar_disponibilidad_salon`) — no hay
    zona horaria que resolver, un `date` no tiene componente de hora.
    """
    return DIAS_SEMANA[fecha.weekday()]


def hay_solapamiento(
    hora_inicio_a: datetime.time,
    hora_fin_a: datetime.time,
    hora_inicio_b: datetime.time,
    hora_fin_b: datetime.time,
) -> bool:
    """Devuelve True si las franjas [hora_inicio_a, hora_fin_a) y
    [hora_inicio_b, hora_fin_b) se superponen en algún punto.

    Dos franjas adyacentes (una termina exactamente cuando empieza la
    otra) NO se consideran solapadas — mismo criterio que
    `reservas.domain.hay_solapamiento`/`programacion.domain.
    hay_solapamiento`/`reservas_semestrales.domain.hay_solapamiento` (ver
    Nota de diseño del módulo sobre por qué se reimplementa acá).
    """
    return hora_inicio_a < hora_fin_b and hora_inicio_b < hora_fin_a
