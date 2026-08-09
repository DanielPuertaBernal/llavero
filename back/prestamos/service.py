"""
service.py — API pública del módulo prestamos.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
prestamos — nunca importan `model.py`/`repository.py` de este módulo
directamente. Simétricamente, este módulo consume `comunidad`/
`usuarios`/`catalogos`/`equipos`/`novedades` exclusivamente vía su
`.service` respectivo (nunca `.model`/`.repository` de esos módulos),
la misma regla dura ya aplicada en `llaves.service`/
`reservas_semestrales.service`.

Es el módulo más complejo del proyecto hasta ahora: dueño de 3 tablas
relacionadas (`Prestamo`/`DetallePrestamo`/`Devolucion`), con creación
multi-fila atómica (`crear_prestamo`: 1 `Prestamo` + N
`DetallePrestamo`) y agregación de estado sobre devolución parcial o
completa (`devolver_equipos`).

Convención de esta API, igual que el resto de módulos:
- `obtener_prestamo`/`listar_*` no lanzan excepción ante "no existe"/
  "sin resultados": devuelven `None`/lista vacía.
- `crear_prestamo` lanza `ValueError` cuando `solicitante_id`/
  `usuario_prestamista_id`/`ubicacion_id` no existen, cuando la
  ubicación no permite préstamo de equipos
  (`domain.validar_permite_prestamo`), cuando algún `equipo_id` no
  existe, o cuando algún `equipo_id` ya está 'entregado' en otro
  préstamo activo (`domain.validar_equipo_disponible`) — ver la Nota de
  diseño de `model.py` sobre por qué este pre-check SÍ se justifica acá
  a diferencia de `llaves`.
- `devolver_equipos` lanza `ValueError` cuando `usuario_recibe_id`/
  `ubicacion_id`/alguna `novedad_id` de `novedades_por_equipo` (si se
  pasa) no existen, o cuando algún `equipo_id` no pertenece al préstamo
  o ya fue devuelto. Devuelve `None` (sin lanzar) cuando `prestamo_id`
  no existe, mismo criterio que `llaves.service.devolver_llave`.

Nota de diseño — `transaction.atomic()` en `crear_prestamo` y
`devolver_equipos`, mismo criterio que `reservas_semestrales.service.
crear_grupo_reservas_semestrales` (ver su propia Nota de diseño):
ambas operaciones escriben VARIAS filas que deben persistirse
todo-o-nada (`crear_prestamo`: 1 `Prestamo` + N `DetallePrestamo`;
`devolver_equipos`: N `DetallePrestamo` actualizados + 1 `Prestamo`
actualizado + 1 `Devolucion` nueva). El resto de funciones de este
módulo (lecturas puras, `obtener_*`/`listar_*`) no lo necesita — cada
una es una única consulta.

Nota de diseño — pre-check de disponibilidad de equipo en
`crear_prestamo` (a diferencia de `llaves`, que no lo hace para su
`UniqueConstraint` equivalente): ver la Nota de diseño completa en
`model.py`. Resumen: `equipos.service` (ver su propio docstring) delega
EXPLÍCITAMENTE a `prestamos` la responsabilidad de calcular la
disponibilidad real de un equipo — una responsabilidad de negocio que
ningún módulo le asignó nunca a `llaves` de forma análoga para `salon`.
Por eso acá SÍ se agrega `domain.validar_equipo_disponible` antes del
INSERT (consultando `repository.existe_detalle_entregado_para_equipo`),
devolviendo un `ValueError` claro en vez de dejar propagar el
`IntegrityError` crudo de `idx_equipo_entregado_unico`. El
`UniqueConstraint` de BD se conserva de todos modos como garantía final
contra la condición de carrera entre dos requests concurrentes —
ninguna consulta previa no atómica en Python puede reemplazarla del
todo.

Dos elementos repetidos en `equipo_ids` (el mismo equipo dos veces en
la misma solicitud de `crear_prestamo`) también quedan cubiertos sin
lógica adicional: para cuando se valida el segundo, el primero ya fue
persistido (aunque no confirmado/commiteado todavía) dentro de la misma
transacción, así que `repository.existe_detalle_entregado_para_equipo`
ya lo ve — el segundo falla con el mismo ValueError "ya está prestado"
(mismo mecanismo ya documentado en `reservas_semestrales.service` para
el solapamiento entre franjas de la misma solicitud). Mismo mecanismo
aplica de forma simétrica a `equipo_ids` repetidos dentro de una misma
llamada a `devolver_equipos`: el segundo intento de devolver el mismo
equipo encuentra su `DetallePrestamo` ya 'devuelto' y falla con
ValueError "ya fue devuelto".

Nota de diseño — sin validación de `equipo.estado == 'activo'` en
`crear_prestamo`: ni el DDL ni el contexto de negocio disponible para
este módulo declaran esa restricción como regla de préstamo (a
diferencia de la disponibilidad por "ya entregado", que sí está
explícitamente delegada por `equipos.service`, ver arriba) — no se
inventa. Si en el futuro hace falta, es una decisión de negocio
explícita a tomar después.

Nota de diseño — sin `validar_permite_devolucion` en
`devolver_equipos`: el DDL no declara ningún campo
`permite_devolucion_equipos` en `catalogos.Ubicacion` (a diferencia de
`permite_devolucion_llaves`, que sí existe y sí se valida en
`llaves.service.devolver_llave`) — no se inventa esa restricción acá.
`ubicacion_id` en `devolver_equipos` solo se valida como referencia
existente, sin ningún chequeo de permiso.
"""

from django.db import transaction
from django.utils import timezone

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from equipos import service as equipos_service
from novedades import service as novedades_service
from prestamos import domain, repository
from prestamos.model import EstadoDetalleEquipo, EstadoPrestamo
from usuarios import service as usuarios_service


# ------------------------------------------------------------------
# Lecturas
# ------------------------------------------------------------------


def listar_prestamos():
    return repository.listar_prestamos()


def obtener_prestamo(prestamo_id):
    """Devuelve el Prestamo con ese id, o None si no existe."""
    return repository.obtener_prestamo(prestamo_id)


def listar_prestamos_por_solicitante(solicitante_id):
    return repository.listar_prestamos_por_solicitante(solicitante_id)


def listar_prestamos_por_estado(estado: str):
    return repository.listar_prestamos_por_estado(estado)


def listar_detalles_por_prestamo(prestamo_id):
    return repository.listar_detalles_por_prestamo(prestamo_id)


def listar_devoluciones_por_prestamo(prestamo_id):
    return repository.listar_devoluciones_por_prestamo(prestamo_id)


# ------------------------------------------------------------------
# crear_prestamo
# ------------------------------------------------------------------


def _validar_y_crear_detalle(prestamo_id, equipo_id):
    if equipos_service.obtener_equipo(equipo_id) is None:
        raise ValueError(f"No existe un equipo con id {equipo_id}")
    ya_entregado = repository.existe_detalle_entregado_para_equipo(equipo_id)
    domain.validar_equipo_disponible(equipo_id, ya_entregado)
    return repository.crear_detalle_prestamo(prestamo_id, equipo_id)


@transaction.atomic
def crear_prestamo(solicitante_id, usuario_prestamista_id, ubicacion_id, equipo_ids: list):
    """Crea un Prestamo (1 fila) + un DetallePrestamo por cada elemento
    de `equipo_ids` (N filas), todo-o-nada dentro de una única
    transacción (ver Nota de diseño del módulo). Devuelve el Prestamo
    creado (el agregado raíz); sus detalles se consultan por separado
    con `listar_detalles_por_prestamo`.

    Valida primero que `solicitante_id`/`usuario_prestamista_id`/
    `ubicacion_id` existan y que la ubicación permita préstamo de
    equipos (una sola vez, son compartidos por todo el préstamo). Luego
    valida y crea cada detalle en orden: cada `equipo_id` debe existir y
    no estar ya 'entregado' en otro préstamo activo. Si cualquiera
    falla, no se crea nada (ni el Prestamo ni ningún DetallePrestamo).

    Nace siempre en estado 'activo' (default del DDL, ver model.py): no
    hay parámetro `estado` acá.
    """
    if not equipo_ids:
        raise ValueError("Debe incluir al menos un equipo para crear un préstamo")
    if comunidad_service.obtener_persona(solicitante_id) is None:
        raise ValueError(f"No existe un solicitante (comunidad) con id {solicitante_id}")
    if usuarios_service.obtener_usuario(usuario_prestamista_id) is None:
        raise ValueError(
            f"No existe un usuario_prestamista con id {usuario_prestamista_id}"
        )
    ubicacion = catalogos_service.obtener_ubicacion(ubicacion_id)
    if ubicacion is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_id}")
    domain.validar_permite_prestamo(ubicacion.permite_prestamo_equipos)

    prestamo = repository.crear_prestamo(
        solicitante_id, usuario_prestamista_id, ubicacion_id
    )
    for equipo_id in equipo_ids:
        _validar_y_crear_detalle(prestamo.id, equipo_id)
    return prestamo


# ------------------------------------------------------------------
# devolver_equipos
# ------------------------------------------------------------------


def _validar_y_marcar_devuelto(prestamo_id, equipo_id, fecha_devolucion, novedad_id):
    detalle = repository.obtener_detalle_por_prestamo_y_equipo(prestamo_id, equipo_id)
    if detalle is None:
        raise ValueError(f"El equipo {equipo_id} no pertenece al préstamo {prestamo_id}")
    if detalle.estado_equipo != EstadoDetalleEquipo.ENTREGADO:
        raise ValueError(f"El equipo {equipo_id} ya fue devuelto en este préstamo")
    return repository.marcar_detalle_devuelto(
        detalle.id, fecha_devolucion, novedad_id=novedad_id
    )


@transaction.atomic
def devolver_equipos(
    prestamo_id,
    usuario_recibe_id,
    ubicacion_id,
    equipo_ids: list,
    novedades_por_equipo: dict | None = None,
):
    """Devuelve (parcial o completamente) los equipos de `equipo_ids`
    dentro del préstamo `prestamo_id`, dentro de una única transacción
    (ver Nota de diseño del módulo). Devuelve None si `prestamo_id` no
    existe.

    `novedades_por_equipo` es un dict opcional `equipo_id -> novedad_id`
    para adjuntar una novedad puntual a un renglón específico al
    devolverlo — mismo caso de uso que `novedad_id` en
    `llaves.service.devolver_llave` (reportar un daño/pérdida detectado
    AL recibir el equipo de vuelta), pero acá puede haber uno distinto
    por cada equipo devuelto en la misma llamada.

    Valida que `usuario_recibe_id`/`ubicacion_id`/cada `novedad_id` de
    `novedades_por_equipo` (si se pasa) existan. Luego, por cada
    `equipo_id`: valida que su DetallePrestamo pertenezca a ESE
    préstamo y esté actualmente 'entregado' (ValueError claro si no), y
    lo marca 'devuelto' con `fecha_devolucion` (un único `timezone.
    now()` calculado una vez para toda la llamada) y la `novedad_id`
    correspondiente si aplica.

    Tras marcar todos los solicitados, recalcula sobre TODOS los
    detalles del préstamo (`domain.todos_devueltos`) si quedó
    completamente devuelto: actualiza `Prestamo.estado` a
    'completamente_devuelto' (todos los detalles 'devuelto') o
    'parcialmente_devuelto' (esta llamada siempre devuelve al menos un
    equipo, así que si no quedaron todos devueltos, el préstamo deja de
    estar 'activo' de todas formas), y crea 1 fila Devolucion con
    `es_completa` igual a ese mismo resultado.
    """
    if repository.obtener_prestamo(prestamo_id) is None:
        return None
    if not equipo_ids:
        raise ValueError("Debe incluir al menos un equipo para devolver")
    if usuarios_service.obtener_usuario(usuario_recibe_id) is None:
        raise ValueError(f"No existe un usuario_recibe con id {usuario_recibe_id}")
    if catalogos_service.obtener_ubicacion(ubicacion_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_id}")

    novedades_por_equipo = novedades_por_equipo or {}
    for novedad_id in novedades_por_equipo.values():
        if novedad_id is not None and novedades_service.obtener_novedad(novedad_id) is None:
            raise ValueError(f"No existe una novedad con id {novedad_id}")

    fecha_devolucion = timezone.now()
    for equipo_id in equipo_ids:
        _validar_y_marcar_devuelto(
            prestamo_id,
            equipo_id,
            fecha_devolucion,
            novedades_por_equipo.get(equipo_id),
        )

    estados = [
        detalle.estado_equipo
        for detalle in repository.listar_detalles_por_prestamo(prestamo_id)
    ]
    es_completa = domain.todos_devueltos(estados)
    nuevo_estado = (
        EstadoPrestamo.COMPLETAMENTE_DEVUELTO
        if es_completa
        else EstadoPrestamo.PARCIALMENTE_DEVUELTO
    )
    repository.actualizar_estado_prestamo(prestamo_id, nuevo_estado)
    return repository.crear_devolucion(
        prestamo_id, usuario_recibe_id, ubicacion_id, es_completa
    )
