"""
service.py — API pública del módulo disponibilidad.

Módulo de AGREGACIÓN DE SOLO LECTURA (RF14, ver DOC/2. Diseño estratégico/
2.2 Requerimientos.md): "El sistema debe mostrar una vista de disponibilidad
de salón que superponga, en un solo calendario, la programación académica
oficial, las reservas semestrales y las reservas individuales." No tiene
tabla propia (ver docstring de `apps.py`), así que no hay `repository.py`
acá — este `service.py` orquesta llamando exclusivamente a los `.service`
de los tres módulos dueños de cada fuente (`programacion`,
`reservas_semestrales`, `reservas`), nunca a sus `.model`/`.repository` —
la misma regla dura del resto del proyecto, sin excepción posible acá
porque este módulo ni siquiera tiene un `model.py` propio que ampararía
una FK. También valida `salon_id` vía `catalogos.service.obtener_salon`,
mismo patrón que el resto de módulos al validar una referencia cross-módulo.

Convención de retorno de `consultar_disponibilidad_salon`: un `dict` con
valores JSON-nativos (strings, no instancias de modelo ni `UUID`/
`datetime.time`/`datetime.date` crudos) — este módulo no tiene `model.py`
propio y la regla dura del proyecto prohíbe que filtre instancias de
`programacion.model.Programacion`/`reservas_semestrales.model.
ReservaSemestral`/`reservas.model.ReservaIndividual` hacia `controller.py`
(que tampoco puede importar esos `model.py` ajenos). Mismo criterio ya
aplicado en `nfc.service` (ver ese docstring).

Decisión de diseño — representación de la superposición de las 3 fuentes:
se eligió una LISTA UNIFICADA de "ocupaciones" (`resultado["ocupaciones"]`),
cada una con un campo `origen: "programacion" | "reserva_semestral" |
"reserva_individual"`, en vez de tres listas separadas agrupadas por
fuente. Razón: un calendario de frontend (RF14 pide "un solo calendario")
va a iterar y pintar eventos sin importarle de qué tabla vino cada uno —
forzarlo a aplanar tres listas con formas ligeramente distintas (una por
`dia`, otra por `fecha`) es trabajo que este módulo, cuya razón de ser es
justamente conocer a las tres fuentes, puede hacer una sola vez. Agrupar
por fuente serviría mejor a un caso de uso distinto ("mostrar solo las
clases", "mostrar solo las reservas") que RF14 no pide — si aparece ese
requisito, es un `groupby(origen)` trivial sobre esta misma lista, no un
rediseño.

Cada ocupación tiene la forma:
    {
        "origen": "programacion" | "reserva_semestral" | "reserva_individual",
        "id": str,               # UUID de la fila origen (Programacion/
                                  # ReservaSemestral/ReservaIndividual)
        "recurrente": bool,      # True para programacion/reserva_semestral
                                  # (se repite cada semana ese `dia_semana`
                                  # mientras dure el semestre); False para
                                  # reserva_individual (una `fecha` puntual)
        "dia_semana": str | None,   # solo si recurrente
        "fecha": str | None,        # solo si NO recurrente (ISO date)
        "hora_inicio": str,      # ISO time "HH:MM:SS"
        "hora_fin": str,         # ISO time "HH:MM:SS"
        "titulo": str,           # `materia` (programacion) / "Reserva
                                  # semestral" / `motivo` u "Reserva
                                  # individual" (reservas)
        "responsable_id": str,   # docente_id / solicitante_id
        "estado": str | None,    # solo reserva_individual tiene ciclo de
                                  # vida (EstadoReservaIndividual); None
                                  # para las otras dos fuentes
    }

Decisión de diseño — `dia` vs `fecha` como filtro, y por qué las franjas
RECURRENTES (programacion/reserva_semestral) y las de FECHA ESPECÍFICA
(reserva_individual) se combinan distinto según cuál se pasa:
`programacion`/`reservas_semestrales` viven ancladas a un `dia_semana` que
se repite indefinidamente durante el semestre (no a una `fecha` puntual:
ver sus propios `model.py`), mientras que `reservas.ReservaIndividual` vive
anclada a una `fecha` puntual (no a un día de la semana recurrente). No hay
una única columna común para las tres — por eso `consultar_disponibilidad_
salon` acepta AMBOS filtros opcionales:
- Solo `dia` (o ninguno de los dos): trae las franjas recurrentes de ese
  día (o de los 7 días si tampoco se da `dia`), y TODAS las reservas
  individuales del salón sin filtrar por fecha (no hay una fecha concreta
  con la que anclarlas a ese `dia`) — la respuesta sirve para pintar "cómo
  se ve un lunes cualquiera" más el histórico/futuro de reservas puntuales.
- `fecha`: resuelve el `dia_semana` correspondiente
  (`domain.dia_semana_de_fecha`) para traer las franjas recurrentes de ESE
  día concreto, y filtra las reservas individuales a exactamente esa
  `fecha` — la respuesta sirve para pintar "cómo se ve el salón el
  2026-03-09" en un calendario real, con las tres fuentes ya ancladas al
  mismo día calendario.
- Ambos a la vez: se exige que `dia` sea consistente con el día de la
  semana que le corresponde a `fecha` (`ValueError` claro si no) — dar los
  dos parámetros contradictorios sería un request ambiguo, no una
  combinación de filtros independiente (a diferencia de, p. ej.,
  `salon_id` + `estado` en otros módulos, que sí son ortogonales).

Decisión de diseño — `conflictos` (marcado informativo, NO es la
validación de escritura de RF15): además de `ocupaciones`, la respuesta
incluye `conflictos`, una lista de pares `{"ocupacion_a_id",
"ocupacion_b_id"}` de ocupaciones DE ORIGEN DISTINTO cuyas franjas se
solapan (`domain.hay_solapamiento`), calculada SOLO cuando se pasa `fecha`
(con `dia` solo, las reservas individuales no están ancladas a ningún día
concreto de las recurrentes, así que compararlas no tendría sentido — ver
arriba). Esto es una ayuda de LECTURA para que el futuro calendario de
frontend pueda resaltar visualmente un choque ya existente en los datos
(útil precisamente PORQUE hoy `crear_reserva`/`crear_programacion` no
validan cruzado entre las 3 fuentes al escribir — ver Nota de diseño de la
tarea sobre el gap de RF15 reportado por separado). No reemplaza esa
validación de escritura: es una superficie de solo lectura que expone lo
que ya existe en la base de datos, para que un humano (o una futura
validación de escritura) lo vea. No se comparan dos ocupaciones del MISMO
origen entre sí: cada fuente ya se autovalida contra sí misma al crear
(`existe_solapamiento_en_salon`/`existe_solapamiento_en_salon_semestral`/
`existe_solapamiento_en_salon` de `reservas`), así que dos franjas del
mismo origen jamás deberían solaparse en la práctica — comparar ese caso
sería ruido, no una alerta real.
"""

import datetime

from catalogos import service as catalogos_service
from disponibilidad import domain
from programacion import service as programacion_service
from reservas import service as reservas_service
from reservas_semestrales import service as reservas_semestrales_service


def _ocupacion_programacion(p, dia: str) -> dict:
    return {
        "origen": "programacion",
        "id": str(p.id),
        "recurrente": True,
        "dia_semana": dia,
        "fecha": None,
        "hora_inicio": p.hora_inicio.isoformat(),
        "hora_fin": p.hora_fin.isoformat(),
        "titulo": p.materia,
        "responsable_id": str(p.docente_id),
        "estado": None,
    }


def _ocupacion_reserva_semestral(r, dia: str) -> dict:
    return {
        "origen": "reserva_semestral",
        "id": str(r.id),
        "recurrente": True,
        "dia_semana": dia,
        "fecha": None,
        "hora_inicio": r.hora_inicio.isoformat(),
        "hora_fin": r.hora_fin.isoformat(),
        "titulo": "Reserva semestral",
        "responsable_id": str(r.solicitante_id),
        "estado": None,
    }


def _ocupacion_reserva_individual(r) -> dict:
    return {
        "origen": "reserva_individual",
        "id": str(r.id),
        "recurrente": False,
        "dia_semana": None,
        "fecha": r.fecha.isoformat(),
        "hora_inicio": r.hora_inicio.isoformat(),
        "hora_fin": r.hora_fin.isoformat(),
        "titulo": r.motivo or "Reserva individual",
        "responsable_id": str(r.solicitante_id),
        "estado": r.estado,
    }


def _calcular_conflictos(ocupaciones: list[dict]) -> list[dict]:
    conflictos = []
    for i in range(len(ocupaciones)):
        a = ocupaciones[i]
        for j in range(i + 1, len(ocupaciones)):
            b = ocupaciones[j]
            if a["origen"] == b["origen"]:
                continue
            if domain.hay_solapamiento(
                datetime.time.fromisoformat(a["hora_inicio"]),
                datetime.time.fromisoformat(a["hora_fin"]),
                datetime.time.fromisoformat(b["hora_inicio"]),
                datetime.time.fromisoformat(b["hora_fin"]),
            ):
                conflictos.append({"ocupacion_a_id": a["id"], "ocupacion_b_id": b["id"]})
    return conflictos


def consultar_disponibilidad_salon(
    salon_id, dia: str | None = None, fecha: datetime.date | None = None
) -> dict:
    """Superpone, en una sola estructura, las franjas de `programacion` +
    `reservas_semestrales` + `reservas` para `salon_id` (RF14) — ver
    docstring del módulo para el detalle completo de la forma de la
    respuesta y de cómo se combinan `dia`/`fecha`.

    Lanza `ValueError` si `salon_id` no existe (vía
    `catalogos.service.obtener_salon`), o si se pasan `dia` Y `fecha` a la
    vez y son inconsistentes entre sí.
    """
    if catalogos_service.obtener_salon(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")

    dia_resuelto = dia
    if fecha is not None:
        dia_de_la_fecha = domain.dia_semana_de_fecha(fecha)
        if dia is not None and dia != dia_de_la_fecha:
            raise ValueError(
                f"dia='{dia}' no corresponde al día de la semana de fecha={fecha} "
                f"('{dia_de_la_fecha}')"
            )
        dia_resuelto = dia_de_la_fecha

    dias_a_consultar = [dia_resuelto] if dia_resuelto is not None else domain.DIAS_SEMANA

    ocupaciones = []
    for d in dias_a_consultar:
        for p in programacion_service.listar_programaciones_por_salon_y_dia(salon_id, d):
            ocupaciones.append(_ocupacion_programacion(p, d))
        for r in reservas_semestrales_service.listar_por_salon_y_dia(salon_id, d):
            ocupaciones.append(_ocupacion_reserva_semestral(r, d))

    if fecha is not None:
        reservas_individuales = reservas_service.listar_por_salon(
            salon_id, fecha_desde=fecha, fecha_hasta=fecha
        )
    else:
        reservas_individuales = reservas_service.listar_por_salon(salon_id)

    for r in reservas_individuales:
        ocupaciones.append(_ocupacion_reserva_individual(r))

    conflictos = _calcular_conflictos(ocupaciones) if fecha is not None else []

    return {
        "salon_id": str(salon_id),
        "dia": dia_resuelto,
        "fecha": fecha.isoformat() if fecha is not None else None,
        "ocupaciones": ocupaciones,
        "conflictos": conflictos,
    }
