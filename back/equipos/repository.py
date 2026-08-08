"""
repository.py — única capa del módulo equipos que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: equipo.
"""

from equipos.model import Equipo, EstadoEquipo


def listar_equipos():
    return list(Equipo.objects.order_by("nombre"))


def crear_equipo(
    nombre: str,
    codigo_inventario: str,
    marca: str | None = None,
    codigo_barras: str | None = None,
    estado: str = EstadoEquipo.ACTIVO,
) -> Equipo:
    return Equipo.objects.create(
        nombre=nombre,
        codigo_inventario=codigo_inventario,
        marca=marca,
        codigo_barras=codigo_barras,
        estado=estado,
    )


def obtener_equipo_por_id(equipo_id):
    return Equipo.objects.filter(id=equipo_id).first()


def obtener_equipo_por_codigo_inventario(codigo_inventario: str):
    return Equipo.objects.filter(codigo_inventario=codigo_inventario).first()


def obtener_equipo_por_codigo_barras(codigo_barras: str):
    return Equipo.objects.filter(codigo_barras=codigo_barras).first()


def listar_equipos_por_estado(estado: str):
    return list(Equipo.objects.filter(estado=estado).order_by("nombre"))
