"""
repository.py — única capa del módulo novedades que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: novedad.

`listar_por_estado`/`listar_por_categoria` son los dos filtros de
listado que tienen sentido de negocio dado el DDL (los únicos dos
campos categóricos de la tabla): `listar_por_estado("abierta")` es la
consulta de triage típica ("¿qué novedades siguen sin resolver?").
"""

from novedades.model import EstadoNovedad, Novedad


def listar_novedades():
    # Sin campo de fecha en el DDL (ver model.py, nota de diseño), se
    # ordena por categoria/estado para agrupar novedades del mismo tipo
    # y dejar las abiertas primero dentro de cada grupo ("abierta" <
    # "cerrada" alfabéticamente) — orden determinista sin inventar una
    # columna que el DDL no declara.
    return list(Novedad.objects.order_by("categoria", "estado"))


def crear_novedad(
    categoria: str,
    registrado_por_id,
    descripcion: str | None = None,
) -> Novedad:
    return Novedad.objects.create(
        categoria=categoria,
        registrado_por_id=registrado_por_id,
        descripcion=descripcion,
    )


def obtener_por_id(novedad_id):
    return Novedad.objects.filter(id=novedad_id).first()


def listar_por_estado(estado: str):
    return list(Novedad.objects.filter(estado=estado).order_by("categoria"))


def listar_por_categoria(categoria: str):
    return list(Novedad.objects.filter(categoria=categoria).order_by("estado"))


def cerrar_novedad(novedad_id, solucion: str):
    """Pone estado='cerrada' y guarda la solución en la Novedad con ese
    id, o devuelve None si no existe. La validación de que `solucion` no
    esté vacía pasa por domain.py/service.py antes de llegar acá — este
    método asume que esa decisión ya se tomó (mismo patrón que
    `usuarios.repository.desactivar_usuario` con la autoprotección de
    desactivación)."""
    novedad = Novedad.objects.filter(id=novedad_id).first()
    if novedad is None:
        return None
    novedad.estado = EstadoNovedad.CERRADA
    novedad.solucion = solucion
    novedad.save(update_fields=["estado", "solucion"])
    return novedad
