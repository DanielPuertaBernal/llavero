"""
service.py — API pública del módulo llaves.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
llaves — nunca importan `model.py`/`repository.py` de este módulo
directamente. Simétricamente, este módulo consume `catalogos`,
`comunidad`, `usuarios` y `novedades` exclusivamente vía su `.service`
respectivo (nunca `.model`/`.repository` de esos módulos), la misma
regla dura ya aplicada en `monitores.service` (consumiendo `comunidad`/
`programacion`) y en `novedades.service` (consumiendo `usuarios`).

Convención de esta API, igual que el resto de módulos:
- Los `obtener_*`/`listar_*` no lanzan excepción ante "no existe" /
  "sin resultados": devuelven `None`/lista vacía. La decisión de qué
  hacer (404, etc.) queda del lado de quien llama.
- `crear_llave` lanza `ValueError` cuando alguna de las 5 referencias que
  recibe (`salon_id`, `docente_titular_id`, `reclamado_por_id`,
  `usuario_entrega_id`, `ubicacion_entrega_id`) no existe en su módulo
  dueño, igual patrón que `monitores.service.crear_monitor` valida sus
  FKs contra `comunidad.service`. Además valida
  `domain.validar_permite_prestamo` sobre la ubicación de entrega antes
  de crear.
- `devolver_llave` lanza `ValueError` cuando `usuario_recibe_id`/
  `ubicacion_devolucion_id`/`novedad_id` (si se pasa) no existen, y
  valida `domain.validar_permite_devolucion` sobre la ubicación de
  devolución antes de devolver.

Nota de diseño — `listar_llaves_activas_por_reclamado_por` (agregada para
el módulo `nfc`, ver su propio docstring): extensión aditiva simétrica a
`listar_llaves_por_estado`/`listar_llaves_por_docente_titular`, ambas ya
existentes con la misma forma (un filtro simple expuesto para que otro
módulo resuelva una pregunta de negocio sin tocar `llaves.model`/
`repository`). Resuelve "¿qué llave(s) tiene esta persona actualmente en
su poder?" — cualquier estado distinto de `'entregado'` cuenta (no solo
`'en_prestamo'`: una llave en `'demora_entrega'` sigue sin devolverse).

`novedad_id` solo se expone como parámetro de `devolver_llave` (no de
`crear_llave`): el caso de uso real de esta FK es reportar un daño/
pérdida detectado AL recibir la llave de vuelta (ver
`novedades.model`, comentario del DDL sobre por qué esa tabla existe
antes que ésta). Nada en el DDL ni en el análisis de negocio disponible
sugiere que una llave pueda nacer con una novedad ya adjunta; no se
inventa ese caso de uso.

Nota de diseño — integración con `reservas` (dependencia UNIDIRECCIONAL
`llaves` -> `reservas`, decisión de arquitectura acordada explícitamente
con el usuario en la conversación de diseño de este cambio): `crear_llave`
acepta ahora un parámetro opcional `reserva_id=None`. Cuando
`origen='reserva_individual'` Y se pasa `reserva_id`, este módulo valida
—vía `reservas.service.obtener_reserva`, nunca vía `reservas.model`/
`repository`— que la reserva exista y esté en estado `'aprobada'` (lanza
`ValueError` claro si no), y tras crear la llave con éxito llama a
`reservas.service.completar_reserva(reserva_id)` para hacer el "check-in"
físico de la reserva (estado -> `'completada'`). Se eligió esta dirección
de import (`llaves` importa `reservas.service`, `reservas` JAMÁS importa
nada de `llaves`) para resolver el ciclo natural `llaves<->reservas` que
surgiría de la relación inversa (una reserva "sabe" qué llave la
completó) sin introducir señales de Django ni un módulo orquestador
nuevo — la misma regla dura de este proyecto ("el módulo consumidor
importa el `.service` del módulo dueño") ya resuelve el ciclo sin
maquinaria adicional, simplemente escogiendo qué lado es el consumidor:
`llaves` es quien dispara el evento de negocio ("se entregó la llave"),
así que es natural que sea `llaves` quien notifique a `reservas`, no al
revés. Ver la nota de diseño simétrica en `reservas/model.py`/
`reservas/service.py` sobre por qué ese módulo nunca debe importar
`llaves`.

Si `origen` es distinto de `'reserva_individual'` y de todas formas se
pasa un `reserva_id`, se lanza `ValueError`: no tiene sentido asociar una
reserva a una llave de origen `'programacion'`/`'reserva_semestral'`/
`'manual'` (decisión de diseño — falla explícita y temprana en vez de
ignorar en silencio un parámetro que el caller pasó por error, mismo
criterio de "error claro" que el resto de validaciones de este método).
Si `origen='reserva_individual'` pero NO se pasa `reserva_id`, no se hace
ninguna validación/transición extra: se permite crear una llave de ese
origen sin asociarla a una reserva concreta (p. ej. un flujo manual sobre
una reserva registrada por fuera de este sistema) — el DDL no exige esa
asociación como FK real (ver `model.py`, nota de diseño sobre `origen`
como enum de solo forma).

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT/UPDATE de una sola tabla, ya atómico de por
sí en Django (autocommit por sentencia).

Nota de diseño — `marcar_demora` (transición automática por tiempo,
`domain.es_mora`, ver ese módulo): lanza `ValueError` si la llave no
existe (a diferencia de `devolver_llave`, que devuelve `None` — se eligió
`ValueError` acá porque el único caller previsto es el futuro `scheduler`
recorriendo una lista de llaves `en_prestamo` que él mismo acaba de
consultar vía `listar_llaves_por_estado`; un id ausente en ese flujo es un
error de programación/carrera de datos, no un "no encontrado" esperable
de un caller HTTP), y es un no-op silencioso (sin error) si la llave ya
está en `'demora_entrega'` o `'entregado'` — la transición solo tiene
sentido una vez, desde `'en_prestamo'`. NO envía ninguna notificación ni
lee `configuracion`: eso es responsabilidad del futuro scheduler
(orquestador), no de este módulo (ver `sdd/scheduler-transiciones`).

Regla dura de dirección de import (ver `sdd/scheduler-transiciones`):
`notificaciones.service` ahora importa `llaves.service` (para validar
`llave_id` al correlacionar un recordatorio, vía `obtener_llave`). Por
eso `llaves.service` JAMÁS debe importar `notificaciones.service` de
vuelta — eso crearía un ciclo real. Este módulo no envía notificaciones;
el futuro scheduler es el único orquestador que conoce ambos módulos.
"""

from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from llaves import domain, repository
from llaves.model import EstadoLlave, OrigenLlave
from novedades import service as novedades_service
from reservas import service as reservas_service
from usuarios import service as usuarios_service


def listar_llaves():
    return repository.listar_llaves()


def crear_llave(
    salon_id,
    docente_titular_id,
    reclamado_por_id,
    origen: str,
    tipo_entrega: str,
    usuario_entrega_id,
    ubicacion_entrega_id,
    reserva_id=None,
):
    """Crea una Llave (entrega inicial) validando primero que las 5
    referencias recibidas existan en su módulo dueño, y que la ubicación
    de entrega permita préstamo de llaves — para devolver un ValueError
    claro en vez de dejar propagar el IntegrityError crudo de Postgres.

    Nace siempre en estado 'en_prestamo' (default del DDL, ver model.py):
    no hay parámetro `estado` acá — el único camino a 'entregado' es
    `devolver_llave`.

    `reserva_id` es opcional y solo aplica junto con
    `origen='reserva_individual'` (ver Nota de diseño del módulo): si se
    pasa en ese caso, valida que la reserva exista y esté 'aprobada', y
    tras crear la llave la completa (`reservas.service.completar_reserva`).
    Si `origen` es distinto y de todas formas se pasa `reserva_id`, lanza
    ValueError.
    """
    if catalogos_service.obtener_salon(salon_id) is None:
        raise ValueError(f"No existe un salon con id {salon_id}")
    if comunidad_service.obtener_persona(docente_titular_id) is None:
        raise ValueError(
            f"No existe un docente_titular (comunidad) con id {docente_titular_id}"
        )
    if comunidad_service.obtener_persona(reclamado_por_id) is None:
        raise ValueError(
            f"No existe un reclamado_por (comunidad) con id {reclamado_por_id}"
        )
    if usuarios_service.obtener_usuario(usuario_entrega_id) is None:
        raise ValueError(
            f"No existe un usuario_entrega con id {usuario_entrega_id}"
        )
    ubicacion_entrega = catalogos_service.obtener_ubicacion(ubicacion_entrega_id)
    if ubicacion_entrega is None:
        raise ValueError(
            f"No existe una ubicacion_entrega con id {ubicacion_entrega_id}"
        )
    domain.validar_permite_prestamo(ubicacion_entrega.permite_prestamo_llaves)

    if origen == OrigenLlave.RESERVA_INDIVIDUAL:
        if reserva_id is not None:
            reserva = reservas_service.obtener_reserva(reserva_id)
            if reserva is None:
                raise ValueError(
                    f"No existe una reserva_individual con id {reserva_id}"
                )
            if reserva.estado != "aprobada":
                raise ValueError(
                    f"La reserva_individual {reserva_id} no está en estado "
                    f"'aprobada' (está en '{reserva.estado}'), no se puede "
                    "asociar a una nueva llave"
                )
    elif reserva_id is not None:
        raise ValueError(
            "reserva_id solo aplica cuando origen='reserva_individual'"
        )

    llave = repository.crear_llave(
        salon_id,
        docente_titular_id,
        reclamado_por_id,
        origen,
        tipo_entrega,
        usuario_entrega_id,
        ubicacion_entrega_id,
    )

    if origen == OrigenLlave.RESERVA_INDIVIDUAL and reserva_id is not None:
        reservas_service.completar_reserva(reserva_id)

    return llave


def obtener_llave(llave_id):
    """Devuelve la Llave con ese id, o None si no existe."""
    return repository.obtener_por_id(llave_id)


def listar_llaves_por_estado(estado: str):
    return repository.listar_por_estado(estado)


def listar_llaves_por_docente_titular(docente_titular_id):
    return repository.listar_por_docente_titular(docente_titular_id)


def listar_llaves_activas_por_reclamado_por(reclamado_por_id):
    """Llaves que esa persona tiene actualmente en su poder (estado
    distinto de 'entregado') — agregado a este módulo para el consumo del
    futuro `nfc` (resolución automática de devolución al leer una
    credencial: "¿esta persona tiene una llave pendiente?"), sin que ese
    módulo importe `llaves.model`/`repository` (ver docstring del
    módulo)."""
    return repository.listar_activas_por_reclamado_por(reclamado_por_id)


def marcar_demora(llave_id):
    """Marca la Llave con ese id en 'demora_entrega' (transición
    automática por tiempo, ver Nota de diseño del módulo).

    Lanza ValueError si la llave no existe. Es un no-op (no lanza, no
    cambia nada) si la llave ya está en 'demora_entrega' o 'entregado':
    solo transiciona desde 'en_prestamo'. No envía notificaciones ni lee
    `configuracion`.
    """
    llave = repository.obtener_por_id(llave_id)
    if llave is None:
        raise ValueError(f"No existe una llave con id {llave_id}")
    if llave.estado != EstadoLlave.EN_PRESTAMO:
        return llave
    return repository.marcar_demora(llave_id)


def devolver_llave(
    llave_id,
    usuario_recibe_id,
    ubicacion_devolucion_id,
    tipo_devolucion: str,
    novedad_id=None,
):
    """Devuelve la Llave con ese id (estado -> 'entregado'), validando
    primero que `usuario_recibe_id`/`ubicacion_devolucion_id`/
    `novedad_id` (si se pasa) existan, y que la ubicación de devolución
    permita devolución de llaves (`domain.validar_permite_devolucion`) —
    lanza ValueError claro en cualquiera de esos casos. Devuelve None si
    la llave no existe, o la Llave ya actualizada.
    """
    if repository.obtener_por_id(llave_id) is None:
        return None

    if usuarios_service.obtener_usuario(usuario_recibe_id) is None:
        raise ValueError(f"No existe un usuario_recibe con id {usuario_recibe_id}")
    ubicacion_devolucion = catalogos_service.obtener_ubicacion(ubicacion_devolucion_id)
    if ubicacion_devolucion is None:
        raise ValueError(
            f"No existe una ubicacion_devolucion con id {ubicacion_devolucion_id}"
        )
    domain.validar_permite_devolucion(ubicacion_devolucion.permite_devolucion_llaves)
    if novedad_id is not None and novedades_service.obtener_novedad(novedad_id) is None:
        raise ValueError(f"No existe una novedad con id {novedad_id}")

    return repository.devolver_llave(
        llave_id,
        usuario_recibe_id,
        ubicacion_devolucion_id,
        tipo_devolucion,
        timezone.now(),
        novedad_id=novedad_id,
    )
