"""
service.py — API pública del módulo nfc.

Módulo de ORQUESTACIÓN PURA (RF04, ver DOC/2. Diseño estratégico/2.2
Requerimientos.md): "El sistema debe resolver automáticamente si una
lectura de credencial corresponde a una entrega o una devolución de
llave, sin que el usuario deba indicarlo manualmente." No tiene tabla
propia (ver docstring de `apps.py`), así que no hay `repository.py` acá
— este `service.py` orquesta llamando exclusivamente a los `.service` de
módulos ya construidos (`comunidad`, `llaves`, `programacion`,
`reservas_semestrales`, `monitores`, `catalogos`, `usuarios`), nunca a
sus `.model`/`.repository` — la misma regla dura del resto del proyecto,
sin excepción posible acá porque este módulo ni siquiera tiene un
`model.py` propio que ampararía una FK.

DOC/3. DiseñoTacticoAltoNivel/3.1 ArquitecturaReferencia.md (línea 30)
aclara que el lector de credencial es un dispositivo USB local
(HID/keyboard-wedge) que entrega el valor leído como texto plano a un
campo del navegador: no hay protocolo NFC real que implementar en el
backend. `id_carnet` llega acá como cualquier otro parámetro de un
endpoint HTTP normal, ya decodificado por el frontend.

Convención de retorno de `resolver_credencial`/`procesar_credencial`:
ambas devuelven un `dict` con valores JSON-nativos (strings, no
instancias de modelo ni `UUID`/`datetime` crudos) — este módulo no tiene
`model.py` propio y la regla dura del proyecto prohíbe que filtre
instancias de `llaves.model.Llave`/`programacion.model.Programacion`/etc.
hacia `controller.py` (que tampoco puede importar esos `model.py`
ajenos). El resultado es el contrato estable que el frontend consume,
no un passthrough de objetos ORM ajenos.

Nota de diseño — Monitor NO se cruza contra ReservaSemestral, solo
contra Programacion: `monitores.model.Monitor.materia` es un
`CharField` de texto libre sin FK, y el único lado con el que se puede
cruzar sin ambigüedad es `programacion.model.Programacion.materia`
(mismo campo semántico, también texto libre). Se releyó el DDL completo
de `reserva_semestral` (DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql,
sección "Reservas") y esa tabla NO declara ninguna columna `materia` —
es una franja horaria recurrente de un solicitante concreto (un
semillero, un club), no está atada a una materia académica. Cruzar
`Monitor.materia` contra un campo que no existe en `ReservaSemestral`
sería inventar una relación que el modelo de datos no soporta. Por eso
`_candidatos_entrega_por_delegacion` solo consulta
`programacion.service`, nunca `reservas_semestrales.service` — esto es
una decisión de diseño de este módulo, no una omisión.

Nota de diseño — desempate devolución-antes-que-entrega: si la misma
persona tiene, a la vez, una llave activa reclamada por ella Y una
clase/monitoría vigente ahora mismo, `resolver_credencial` prioriza
devolver la llave pendiente — nunca genera una entrega nueva en ese
caso, ni devuelve ambas acciones a la vez. RF04 no especifica el
criterio de desempate cuando ambas condiciones se cumplen simultáneamente
— es una decisión de este módulo, basada en el caso de negocio más
probable (la persona ya tiene una llave en su poder y la trae de
vuelta, el flujo típico de portería) y en que la alternativa (generar
una segunda entrega mientras la primera sigue activa) es estructuralmente
más riesgosa: si fuera el mismo salón chocaría con
`idx_llave_activa_unica_por_salon` (RNF02); si fuera otro salón, dejaría
a la misma persona con dos llaves activas sin que el sistema lo marque
como una situación a revisar. Si el negocio real pidiera el criterio
contrario, es un cambio de una línea en `resolver_credencial` (invertir
el orden de las dos comprobaciones), no un rediseño del módulo.

Nota de diseño — ambigüedad: dos o más candidatos de devolución (persona
con 2+ llaves activas reclamadas por ella) O dos o más candidatos de
entrega (cruzando `Programacion` + `ReservaSemestral` + delegación de
`Monitor` a la vez) devuelven `{"accion": "ambigua", "candidatos": [...]}`
sin ejecutar nada — el staff decide manualmente. Las validaciones de
solapamiento ya existentes (`programacion.service.
existe_solapamiento_en_salon`/`reservas_semestrales.service.
existe_solapamiento_en_salon_semestral`) impiden que dos franjas de la
MISMA fuente choquen para el mismo salón/día, pero no hay ninguna
validación cruzada entre `Programacion` y `ReservaSemestral` de
distintas fuentes para la MISMA persona en distintos salones a la misma
hora (p. ej. un docente que además solicitó una reserva semestral propia
que coincide con su propia clase) — ese escenario, poco probable pero
posible, es exactamente el que "ambigua" existe para blindar sin que el
sistema adivine cuál de las dos es la intención real. Si hay
candidatos de devolución Y de entrega a la vez, la ambigüedad de
devolución (si la hay) se resuelve primero y gana sobre cualquier
candidato de entrega (ver el desempate de arriba: devolución siempre
tiene prioridad total sobre entrega, ambigua o no).
"""

from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from llaves import service as llaves_service
from llaves.model import OrigenLlave, TipoEntregaLlave
from monitores import service as monitores_service
from nfc import domain
from programacion import service as programacion_service
from reservas_semestrales import service as reservas_semestrales_service
from usuarios import service as usuarios_service


def _candidatos_entrega_propia(persona_id, dia: str, hora) -> list[dict]:
    """Candidatos de entrega a partir de las clases (`Programacion`) y
    reservas semestrales (`ReservaSemestral`) propias de `persona_id` —
    las dos fuentes que, según DOC/4. DiseñoTacticoDetallado/4.1 Modelo de
    Datos.md, pueden generar una Llave automáticamente cuando el docente/
    solicitante pasa su credencial.
    """
    candidatos = []
    for p in programacion_service.listar_programaciones_por_docente(persona_id):
        if p.dia == dia and domain.hora_dentro_de_franja(hora, p.hora_inicio, p.hora_fin):
            candidatos.append(
                {
                    "origen": OrigenLlave.PROGRAMACION,
                    "salon_id": str(p.salon_id),
                    "docente_titular_id": str(persona_id),
                    "reclamado_por_id": str(persona_id),
                }
            )
    for r in reservas_semestrales_service.listar_por_solicitante(persona_id):
        if r.dia == dia and domain.hora_dentro_de_franja(hora, r.hora_inicio, r.hora_fin):
            candidatos.append(
                {
                    "origen": OrigenLlave.RESERVA_SEMESTRAL,
                    "salon_id": str(r.salon_id),
                    "docente_titular_id": str(persona_id),
                    "reclamado_por_id": str(persona_id),
                }
            )
    return candidatos


def _candidatos_entrega_por_delegacion(persona_id, dia: str, hora) -> list[dict]:
    """Candidatos de entrega por delegación de `Monitor`: si `persona_id`
    es monitor delegado ACTIVO de algún docente titular, y ese docente
    tiene una `Programacion` (misma `materia` que la monitoría, mismo día,
    dentro de horario) vigente ahora mismo, es un candidato de entrega —
    ver Nota de diseño del módulo sobre por qué solo se cruza contra
    `Programacion`, nunca contra `ReservaSemestral`.

    Si `monitoria.aula` está seteado, también se exige que coincida con
    el nombre del salón de esa `Programacion`
    (`catalogos.service.obtener_salon`) — un monitor puede estar delegado
    para un aula específica del docente, no para cualquier clase suya.

    El candidato resultante tiene `docente_titular_id` = el docente
    titular (dueño real de la clase) y `reclamado_por_id` = `persona_id`
    (el monitor, quien físicamente recibe la llave) — ver DOC/4.
    DiseñoTacticoDetallado/4.1 Modelo de Datos.md, entidad Monitor.
    """
    candidatos = []
    for monitoria in monitores_service.listar_monitorias_del_monitor(persona_id):
        clases_docente = programacion_service.listar_programaciones_por_docente(
            monitoria.docente_titular_id
        )
        for p in clases_docente:
            if p.materia != monitoria.materia:
                continue
            if p.dia != dia:
                continue
            if not domain.hora_dentro_de_franja(hora, p.hora_inicio, p.hora_fin):
                continue
            if monitoria.aula:
                salon = catalogos_service.obtener_salon(p.salon_id)
                if salon is None or salon.nombre != monitoria.aula:
                    continue
            candidatos.append(
                {
                    "origen": OrigenLlave.PROGRAMACION,
                    "salon_id": str(p.salon_id),
                    "docente_titular_id": str(monitoria.docente_titular_id),
                    "reclamado_por_id": str(persona_id),
                }
            )
    return candidatos


def resolver_credencial(id_carnet: str, ahora=None) -> dict:
    """Resuelve, de SOLO LECTURA (no muta nada), si una lectura de
    credencial corresponde a una entrega o una devolución de llave (RF04).

    `ahora` es inyectable (default `django.utils.timezone.now()`) — mismo
    patrón de testabilidad que `llaves.repository.devolver_llave`
    recibiendo la fecha como parámetro en vez de calcularla adentro, para
    que los tests puedan fijar un "ahora" determinístico sin mockear el
    reloj del sistema. Se convierte a hora LOCAL (`timezone.localtime`)
    antes de resolver día/hora: `TIME_ZONE = "America/Bogota"` en este
    proyecto, y comparar directamente el UTC de `timezone.now()` contra
    franjas horarias locales daría el día/hora equivocados.

    Devuelve uno de:
    - `{"accion": "no_reconocida"}` — `id_carnet` no resuelve a ninguna
      persona de `comunidad`.
    - `{"accion": "devolucion", "llave_id": str}` — la persona tiene
      exactamente una llave activa reclamada por ella.
    - `{"accion": "entrega", "origen": str, "salon_id": str,
      "docente_titular_id": str, "reclamado_por_id": str}` — exactamente
      un candidato de entrega (propio o por delegación de Monitor).
    - `{"accion": "ambigua", "candidatos": [...]}` — 2+ candidatos de
      devolución, o 2+ candidatos de entrega (ver Nota de diseño del
      módulo).
    - `{"accion": "sin_coincidencia"}` — persona reconocida, pero sin
      llave activa ni clase/reserva/delegación vigente ahora mismo.
    """
    if ahora is None:
        ahora = timezone.now()
    ahora_local = timezone.localtime(ahora)
    dia = domain.dia_semana_actual(ahora_local)
    hora = ahora_local.time()

    persona = comunidad_service.obtener_por_carnet(id_carnet)
    if persona is None:
        return {"accion": "no_reconocida"}

    # Devolución tiene prioridad absoluta sobre entrega (ver Nota de
    # diseño del módulo): si hay algo que devolver, ni siquiera se
    # calculan los candidatos de entrega.
    devoluciones = llaves_service.listar_llaves_activas_por_reclamado_por(persona.id)
    if devoluciones:
        if len(devoluciones) > 1:
            return {
                "accion": "ambigua",
                "candidatos": [
                    {"tipo": "devolucion", "llave_id": str(ll.id)} for ll in devoluciones
                ],
            }
        return {"accion": "devolucion", "llave_id": str(devoluciones[0].id)}

    entregas = _candidatos_entrega_propia(persona.id, dia, hora)
    if not entregas:
        # Solo se consulta la delegación de Monitor si la persona NO
        # tiene candidatos propios (ver docstring del módulo/tarea).
        entregas = _candidatos_entrega_por_delegacion(persona.id, dia, hora)

    if entregas:
        if len(entregas) > 1:
            return {
                "accion": "ambigua",
                "candidatos": [{"tipo": "entrega", **c} for c in entregas],
            }
        return {"accion": "entrega", **entregas[0]}

    return {"accion": "sin_coincidencia"}


def procesar_credencial(
    id_carnet: str,
    usuario_id,
    ubicacion_id,
    ahora=None,
    novedad_id=None,
    tipo_devolucion: str = "credencial",
) -> dict:
    """Resuelve `id_carnet` (vía `resolver_credencial`) y, SI la
    resolución es una acción no ambigua (`"entrega"`/`"devolucion"`),
    ejecuta la operación real: `llaves.service.crear_llave(...,
    tipo_entrega="credencial")` o `llaves.service.devolver_llave(...,
    tipo_devolucion=tipo_devolucion, novedad_id=novedad_id)`.

    Si la resolución es `"ambigua"`/`"sin_coincidencia"`/`"no_reconocida"`,
    NO ejecuta nada — devuelve la resolución tal cual para que el
    frontend decida (caer al flujo manual de RF05 vía
    `llaves.service.crear_llave(origen='manual', ...)`, o presentar los
    candidatos ambiguos al staff).

    Valida que `usuario_id`/`ubicacion_id` existan (vía
    `usuarios.service`/`catalogos.service`) ANTES de resolver o intentar
    ejecutar nada — lanza `ValueError` claro si no, en vez de resolver la
    credencial primero y fallar recién al intentar ejecutar la llave.
    """
    if usuarios_service.obtener_usuario(usuario_id) is None:
        raise ValueError(f"No existe un usuario con id {usuario_id}")
    if catalogos_service.obtener_ubicacion(ubicacion_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_id}")

    resolucion = resolver_credencial(id_carnet, ahora=ahora)
    accion = resolucion["accion"]

    if accion == "devolucion":
        llave = llaves_service.devolver_llave(
            resolucion["llave_id"],
            usuario_id,
            ubicacion_id,
            tipo_devolucion,
            novedad_id=novedad_id,
        )
        return {"accion": "devolucion", "llave_id": str(llave.id), "estado": llave.estado}

    if accion == "entrega":
        llave = llaves_service.crear_llave(
            resolucion["salon_id"],
            resolucion["docente_titular_id"],
            resolucion["reclamado_por_id"],
            resolucion["origen"],
            TipoEntregaLlave.CREDENCIAL,
            usuario_id,
            ubicacion_id,
        )
        return {"accion": "entrega", "llave_id": str(llave.id), "estado": llave.estado}

    # "ambigua" / "sin_coincidencia" / "no_reconocida": no se ejecuta nada.
    return resolucion
