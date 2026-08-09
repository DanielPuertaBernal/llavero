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

`novedad_id` solo se expone como parámetro de `devolver_llave` (no de
`crear_llave`): el caso de uso real de esta FK es reportar un daño/
pérdida detectado AL recibir la llave de vuelta (ver
`novedades.model`, comentario del DDL sobre por qué esa tabla existe
antes que ésta). Nada en el DDL ni en el análisis de negocio disponible
sugiere que una llave pueda nacer con una novedad ya adjunta; no se
inventa ese caso de uso.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT/UPDATE de una sola tabla, ya atómico de por
sí en Django (autocommit por sentencia).
"""

from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from llaves import domain, repository
from novedades import service as novedades_service
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
):
    """Crea una Llave (entrega inicial) validando primero que las 5
    referencias recibidas existan en su módulo dueño, y que la ubicación
    de entrega permita préstamo de llaves — para devolver un ValueError
    claro en vez de dejar propagar el IntegrityError crudo de Postgres.

    Nace siempre en estado 'en_prestamo' (default del DDL, ver model.py):
    no hay parámetro `estado` acá — el único camino a 'entregado' es
    `devolver_llave`.
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

    return repository.crear_llave(
        salon_id,
        docente_titular_id,
        reclamado_por_id,
        origen,
        tipo_entrega,
        usuario_entrega_id,
        ubicacion_entrega_id,
    )


def obtener_llave(llave_id):
    """Devuelve la Llave con ese id, o None si no existe."""
    return repository.obtener_por_id(llave_id)


def listar_llaves_por_estado(estado: str):
    return repository.listar_por_estado(estado)


def listar_llaves_por_docente_titular(docente_titular_id):
    return repository.listar_por_docente_titular(docente_titular_id)


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
