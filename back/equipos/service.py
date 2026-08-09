"""
service.py — API pública del módulo equipos.

Es el ÚNICO punto de entrada que otros módulos (el futuro `prestamos`,
principalmente) deben usar para consumir equipos — nunca importan
`model.py`/`repository.py` de este módulo directamente.

Caso de uso previsto para `prestamos` (diseñado pensando en ese consumo
futuro, igual que hizo `catalogos.service` para `usuarios`/`comunidad`):
- `obtener_equipo(id)` para validar `equipo_id` al crear un
  `detalle_prestamo` y para leer el equipo asociado a un préstamo.
- `listar_equipos_activos()` para ofrecer solo equipos en estado
  `activo` como candidatos a préstamo (la disponibilidad *real* —
  descontando equipos ya prestados — es responsabilidad de `prestamos`,
  no de este módulo: ver domain.py, `equipos` no conoce préstamos).
- `obtener_equipo_por_codigo_barras(codigo)` para flujos de escaneo de
  código de barras al recibir/entregar un equipo.

Convención de esta API: los `obtener_*` devuelven `None` cuando el
equipo no existe (no lanzan excepción) — la decisión de qué hacer ante
"no existe" (404, ValueError, etc.) queda del lado de quien llama,
igual que `dict.get()`.

A diferencia de `catalogos.service.crear_salon`, `crear_equipo` no
envuelve nada en un `ValueError`: `equipo` no tiene FKs, así que no hay
una referencia a otra entidad que validar antes de escribir. Los
choques de unicidad (`codigo_inventario`/`codigo_barras` duplicados)
se dejan propagar como `IntegrityError` crudo de Postgres, igual que
`catalogos.service.crear_rol` con nombres duplicados.

No se usa `transaction.atomic()`: cada operación de escritura es un
único INSERT de una sola tabla, ya atómico de por sí en Django
(autocommit por sentencia).
"""

from equipos import repository
from equipos.model import EstadoEquipo


def listar_equipos():
    return repository.listar_equipos()


def crear_equipo(
    nombre: str,
    codigo_inventario: str,
    marca: str | None = None,
    codigo_barras: str | None = None,
    estado: str = EstadoEquipo.ACTIVO,
):
    return repository.crear_equipo(
        nombre,
        codigo_inventario,
        marca=marca,
        codigo_barras=codigo_barras,
        estado=estado,
    )


def obtener_equipo(equipo_id):
    """Devuelve el Equipo con ese id, o None si no existe."""
    return repository.obtener_equipo_por_id(equipo_id)


def obtener_equipo_por_codigo_inventario(codigo_inventario: str):
    """Devuelve el Equipo con ese código de inventario, o None si no existe."""
    return repository.obtener_equipo_por_codigo_inventario(codigo_inventario)


def obtener_equipo_por_codigo_barras(codigo_barras: str):
    """Devuelve el Equipo con ese código de barras, o None si no existe."""
    return repository.obtener_equipo_por_codigo_barras(codigo_barras)


def listar_equipos_activos():
    return repository.listar_equipos_por_estado(EstadoEquipo.ACTIVO)
