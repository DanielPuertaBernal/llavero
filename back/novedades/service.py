"""
service.py — API pública del módulo novedades.

Es el ÚNICO punto de entrada que otros módulos (los futuros `llaves`/
`prestamos`, que referencian `novedad_id` desde `llave`/
`detalle_prestamo`) deben usar para consumir novedades — nunca importan
`model.py`/`repository.py` de este módulo directamente. Simétricamente,
este módulo consume `usuarios` exclusivamente vía `usuarios.service`
(nunca `usuarios.model`/`usuarios.repository`), la misma regla dura ya
aplicada en `monitores.service` (consumiendo `comunidad`/`programacion`)
y en `usuarios.service` (consumiendo `catalogos`).

Convención de esta API, igual que el resto de módulos:
- Los `obtener_*`/`listar_*` no lanzan excepción ante "no existe" /
  "sin resultados": devuelven `None`/lista vacía. La decisión de qué
  hacer (404, etc.) queda del lado de quien llama.
- `crear_novedad` lanza `ValueError` cuando `registrado_por_id` no
  existe en `usuarios`, igual patrón que `monitores.service.crear_
  monitor` valida sus FKs contra `comunidad.service`.
- `cerrar_novedad` lanza `ValueError` cuando `solucion` está vacía
  (`domain.validar_cierre`), igual patrón que `monitores.service.crear_
  monitor` anticipa `domain.validar_docente_distinto_de_monitor`.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT/UPDATE de una sola tabla, ya atómico de por
sí en Django (autocommit por sentencia).
"""

from novedades import domain, repository
from usuarios import service as usuarios_service


def listar_novedades():
    return repository.listar_novedades()


def crear_novedad(categoria: str, registrado_por_id, descripcion: str | None = None):
    """Crea una Novedad validando primero que `registrado_por_id` exista
    en usuarios, para devolver un ValueError claro en vez de dejar
    propagar el IntegrityError crudo de Postgres.

    Nace siempre en estado 'abierta' (default del DDL, ver model.py): no
    hay parámetro `estado` acá — el único camino a 'cerrada' es
    `cerrar_novedad`.
    """
    if usuarios_service.obtener_usuario(registrado_por_id) is None:
        raise ValueError(
            f"No existe un usuario (registrado_por) con id {registrado_por_id}"
        )
    return repository.crear_novedad(
        categoria, registrado_por_id, descripcion=descripcion
    )


def obtener_novedad(novedad_id):
    """Devuelve la Novedad con ese id, o None si no existe."""
    return repository.obtener_por_id(novedad_id)


def listar_novedades_por_estado(estado: str):
    return repository.listar_por_estado(estado)


def listar_novedades_por_categoria(categoria: str):
    return repository.listar_por_categoria(categoria)


def cerrar_novedad(novedad_id, solucion: str):
    """Cierra la Novedad con ese id (estado -> 'cerrada'), validando
    primero que `solucion` no esté vacía (`domain.validar_cierre`) —
    lanza ValueError claro en ese caso. Devuelve None si la novedad no
    existe, o la Novedad ya actualizada.
    """
    domain.validar_cierre(solucion)
    return repository.cerrar_novedad(novedad_id, solucion)
