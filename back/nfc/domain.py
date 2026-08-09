"""
domain.py — lógica de negocio pura del módulo nfc (sin DB, sin I/O).

Este módulo no tiene tabla propia ni modelo ORM (ver docstring de
`apps.py`): `domain.py` acá no protege ningún CHECK/constraint del DDL
(no hay ninguno que proteger) — es simplemente donde vive la lógica de
"matching" día/hora, pura y testeable sin base de datos, que
`service.resolver_credencial` usa para decidir si una `Programacion`/
`ReservaSemestral` está vigente en el momento en que se lee una
credencial.

`DIAS_SEMANA`: mismos 7 valores que `programacion.model.DiaSemana`/
`monitores.model.DiaSemana`/`reservas_semestrales.model.DiaSemana,
redefinidos acá localmente en vez de importados — mismo criterio ya
fijado en esos tres módulos (ver sus propias notas de diseño en
`model.py`): un `TextChoices` no es la excepción documentada de este
proyecto para importar el `model.py` de otro módulo (esa excepción es
únicamente declarar una columna `ForeignKey`); acoplar este módulo al
ciclo de vida de `programacion`/`monitores`/`reservas_semestrales` solo
para no repetir 7 strings no está justificado. Además, a diferencia de
esos tres módulos, `nfc` ni siquiera tiene un `model.py` propio donde
"vivir" ese acoplamiento — con mayor razón no hay ninguna excepción de
FK que invocar acá.
"""

DIAS_SEMANA = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
]


def dia_semana_actual(ahora) -> str:
    """Mapea `ahora.weekday()` (convención de Python: 0=lunes ... 6=domingo,
    la misma que usa `datetime.date`/`datetime.datetime`) al string
    correspondiente, con los mismos 7 valores que el resto del proyecto usa
    para la columna `dia_semana` (ver `DIAS_SEMANA` arriba).

    `ahora` puede ser cualquier objeto con `.weekday()` (un
    `datetime.date` o `datetime.datetime`, aware o naive) — quien llama
    (`service.py`) es responsable de convertir a hora LOCAL antes de
    invocar esta función si `ahora` viene de `timezone.now()` (aware, en
    UTC): comparar el día de la semana en UTC contra franjas horarias
    locales (`TIME_ZONE = "America/Bogota"`) daría el día equivocado
    cerca de la medianoche.
    """
    return DIAS_SEMANA[ahora.weekday()]


def hora_dentro_de_franja(hora_actual, hora_inicio, hora_fin) -> bool:
    """True si `hora_actual` cae dentro de la franja [hora_inicio, hora_fin).

    Límite inferior inclusivo, superior exclusivo — mismo criterio que
    `programacion.domain.hay_solapamiento`/`reservas_semestrales.domain.
    hay_solapamiento` tratan el fin de una franja como el instante exacto
    en que ya no está vigente (dos franjas adyacentes, una que termina
    justo cuando otra empieza, no se consideran solapadas). Acá el
    equivalente es: el instante exacto `hora_fin` ya NO cuenta como
    "dentro" de la clase.
    """
    return hora_inicio <= hora_actual < hora_fin
