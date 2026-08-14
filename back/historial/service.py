"""
service.py — API pública del módulo historial.

Módulo de AGREGACIÓN DE SOLO LECTURA (RF27, RF28 — ver DOC/2. Diseño
estratégico/2.2 Requerimientos.md): "El sistema debe mantener un
historial de todas las entregas y devoluciones (llaves y equipos),
indicando quién las procesó" (RF27), con "Portero" viendo únicamente lo
que él mismo procesó y "Administrador"/"Auxiliar" viendo el historial
completo (RF28). No tiene tabla propia (ver docstring de `apps.py`), así
que no hay `repository.py` acá — este `service.py` orquesta llamando
exclusivamente a `llaves.service`/`prestamos.service` (nunca a sus
`.model`/`.repository`), mismo patrón que `disponibilidad.service`.

Fuentes de "entregas y devoluciones" y cómo se traducen a "eventos":

- `llaves.Llave`: cada fila YA es una entrega (`usuario_entrega_id`,
  `fecha_hora_entrega`, ambos NUNCA null). Si además ya se devolvió
  (`fecha_hora_devolucion`/`usuario_recibe_id` no nulos), esa MISMA fila
  también produce un segundo evento de devolución. Es decir, una Llave
  produce 1 evento (solo entrega) o 2 eventos (entrega + devolución).

- `prestamos.Prestamo` + `prestamos.Devolucion`: a diferencia de
  `Llave`, acá el modelo de datos separa entrega y devolución en dos
  tablas distintas. Un evento de entrega corresponde a la CREACIÓN de un
  `Prestamo` (procesada por `usuario_prestamista_id`, con
  `fecha_creacion`) — no hay un evento de entrega por cada
  `DetallePrestamo`/equipo: los N equipos de un mismo préstamo se
  entregan todos en el mismo acto administrativo, así que se modela
  como UN solo evento (con `equipo_ids` listando los N equipos
  entregados en ese acto, vía `listar_detalles_por_prestamo`). Un evento
  de devolución corresponde a cada fila de `Devolucion` (procesada por
  `usuario_recibe_id`, con `fecha`) — puede haber varias por préstamo si
  la devolución fue parcial en distintos momentos (`es_completa=False`
  en las intermedias, `True` en la que deja el préstamo sin equipos
  pendientes).

Decisión de diseño — por qué el evento de devolución de equipos NO
expone `equipo_ids` (a diferencia del de entrega, que sí): `Devolucion`
(ver `prestamos/model.py`) no tiene ninguna FK/columna que enlace esa
fila con los `DetallePrestamo` concretos que devolvió — solo sabe a qué
`Prestamo` pertenece y si esa devolución dejó todo devuelto
(`es_completa`). Intentar reconstruir esa lista comparando
`DetallePrestamo.fecha_devolucion` contra `Devolucion.fecha` sería
adivinar: son dos llamadas independientes a `timezone.now()`
(`prestamos.service.devolver_equipos` calcula una y
`prestamos.repository.crear_devolucion` otra, ver ese docstring), nunca
garantizadas iguales al microsegundo, y un préstamo con varias
devoluciones parciales podría tener varios `DetallePrestamo` con
timestamps parecidos entre sí. No se inventa un campo que ninguna de las
dos fuentes tiene de verdad — `equipo_ids` va `None` en todo evento de
devolución de equipo.

Convención de retorno de `listar_historial`: una LISTA de "eventos",
cada uno un `dict` con valores JSON-nativos (nunca instancias de modelo
de `llaves`/`prestamos`) — mismo criterio que `disponibilidad.service`
(no tiene `model.py` propio, y la regla dura del proyecto prohíbe
filtrar instancias de modelo de otro módulo hacia `controller.py`).

Se eligió una LISTA UNIFICADA (un evento por fila relevante), con un
campo `tipo_recurso: "llave" | "equipo"` y `tipo_evento: "entrega" |
"devolucion"`, en vez de listas separadas por fuente/tipo — mismo
razonamiento que `disponibilidad.service.consultar_disponibilidad_salon`
sobre `ocupaciones`: una tabla de historial de frontend (RF27 pide "un
historial", singular) va a iterar y pintar filas sin que le importe de
qué tabla vino cada una.

Cada evento tiene la forma (campos comunes a los 2 tipos de recurso,
con `None` en los que no aplican a ese tipo — mismo patrón de "columnas
nullable según origen" que `disponibilidad.service` usa para
`dia_semana`/`fecha` según `recurrente`):
    {
        "tipo_recurso": "llave" | "equipo",
        "tipo_evento": "entrega" | "devolucion",
        "procesado_por_id": str,   # usuario_entrega_id/usuario_recibe_id
                                    # (llave) o usuario_prestamista_id/
                                    # usuario_recibe_id (equipo)
        "fecha_hora": str,         # ISO datetime (fecha_hora_entrega/
                                    # fecha_hora_devolucion de Llave, o
                                    # fecha_creacion de Prestamo/fecha de
                                    # Devolucion)
        # Exclusivos de tipo_recurso == "llave" (None si es "equipo"):
        "llave_id": str | None,
        "salon_id": str | None,
        "docente_titular_id": str | None,
        "reclamado_por_id": str | None,
        # Exclusivos de tipo_recurso == "equipo" (None si es "llave"):
        "prestamo_id": str | None,
        "solicitante_id": str | None,
        "equipo_ids": list[str] | None,  # solo en tipo_evento=="entrega"
                                           # (ver Nota de diseño arriba);
                                           # None también en "entrega" si
                                           # por alguna razón el préstamo
                                           # no tiene detalles (no debería
                                           # ocurrir en la práctica, ver
                                           # prestamos.service.crear_prestamo,
                                           # pero no se asume nunca vacío).
    }

`listar_historial(usuario_id=None)`: sin `usuario_id`, devuelve TODOS
los eventos (uso previsto: Administrador/Auxiliar, RF28). Con
`usuario_id`, devuelve solo los eventos cuyo `procesado_por_id` sea ese
usuario (uso previsto: Portero pasando su propio id — RF28). Este
módulo NO conoce el rol del caller (el backend todavía no implementa
autorización por rol en ningún endpoint, ver nota en
`auth/controller.py`): es `controller.py`/el futuro frontend quien
decide cuándo pasar `usuario_id`, siguiendo el mismo patrón ya usado en
`features/comunidad` del frontend con `crearGuardaDeRol` — no se inventa
autorización acá.

La lista siempre se devuelve ordenada por `fecha_hora` descendente
(`domain.ordenar_por_fecha_desc`, ver ese docstring): el orden natural
de una tabla de historial (lo más reciente primero).
"""

from historial import domain
from llaves import service as llaves_service
from prestamos import service as prestamos_service


def _evento_llave_entrega(llave) -> dict:
    return {
        "tipo_recurso": "llave",
        "tipo_evento": "entrega",
        "procesado_por_id": str(llave.usuario_entrega_id),
        "fecha_hora": llave.fecha_hora_entrega.isoformat(),
        "llave_id": str(llave.id),
        "salon_id": str(llave.salon_id),
        "docente_titular_id": str(llave.docente_titular_id),
        "reclamado_por_id": str(llave.reclamado_por_id),
        "prestamo_id": None,
        "solicitante_id": None,
        "equipo_ids": None,
    }


def _evento_llave_devolucion(llave) -> dict:
    return {
        "tipo_recurso": "llave",
        "tipo_evento": "devolucion",
        "procesado_por_id": str(llave.usuario_recibe_id),
        "fecha_hora": llave.fecha_hora_devolucion.isoformat(),
        "llave_id": str(llave.id),
        "salon_id": str(llave.salon_id),
        "docente_titular_id": str(llave.docente_titular_id),
        "reclamado_por_id": str(llave.reclamado_por_id),
        "prestamo_id": None,
        "solicitante_id": None,
        "equipo_ids": None,
    }


def _eventos_de_llave(llave) -> list[dict]:
    eventos = [_evento_llave_entrega(llave)]
    if llave.fecha_hora_devolucion is not None:
        eventos.append(_evento_llave_devolucion(llave))
    return eventos


def _evento_prestamo_entrega(prestamo) -> dict:
    detalles = prestamos_service.listar_detalles_por_prestamo(prestamo.id)
    return {
        "tipo_recurso": "equipo",
        "tipo_evento": "entrega",
        "procesado_por_id": str(prestamo.usuario_prestamista_id),
        "fecha_hora": prestamo.fecha_creacion.isoformat(),
        "llave_id": None,
        "salon_id": None,
        "docente_titular_id": None,
        "reclamado_por_id": None,
        "prestamo_id": str(prestamo.id),
        "solicitante_id": str(prestamo.solicitante_id),
        "equipo_ids": [str(detalle.equipo_id) for detalle in detalles] or None,
    }


def _evento_prestamo_devolucion(devolucion) -> dict:
    return {
        "tipo_recurso": "equipo",
        "tipo_evento": "devolucion",
        "procesado_por_id": str(devolucion.usuario_recibe_id),
        "fecha_hora": devolucion.fecha.isoformat(),
        "llave_id": None,
        "salon_id": None,
        "docente_titular_id": None,
        "reclamado_por_id": None,
        "prestamo_id": str(devolucion.prestamo_id),
        "solicitante_id": None,
        "equipo_ids": None,
    }


def _eventos_de_prestamo(prestamo) -> list[dict]:
    eventos = [_evento_prestamo_entrega(prestamo)]
    devoluciones = prestamos_service.listar_devoluciones_por_prestamo(prestamo.id)
    eventos.extend(_evento_prestamo_devolucion(d) for d in devoluciones)
    return eventos


def listar_historial(usuario_id=None) -> list[dict]:
    """Devuelve la lista unificada de eventos de entrega/devolución de
    llaves y equipos (RF27), ordenada por `fecha_hora` descendente.

    Si `usuario_id` viene dado, filtra a solo los eventos donde ese
    usuario aparece como quien procesó (`procesado_por_id`) — el
    mecanismo que implementa la restricción de RF28 para un Portero. Sin
    `usuario_id`, devuelve todos los eventos (uso previsto para
    Administrador/Auxiliar). Ver docstring del módulo para la forma
    exacta de cada evento.
    """
    eventos: list[dict] = []
    for llave in llaves_service.listar_llaves():
        eventos.extend(_eventos_de_llave(llave))
    for prestamo in prestamos_service.listar_prestamos():
        eventos.extend(_eventos_de_prestamo(prestamo))

    eventos = domain.ordenar_por_fecha_desc(eventos)

    if usuario_id is not None:
        eventos = domain.filtrar_por_procesado_por(eventos, str(usuario_id))

    return eventos
