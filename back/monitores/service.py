"""
service.py — API pública del módulo monitores.

Es el ÚNICO punto de entrada que otros módulos (el futuro `llaves`) deben
usar para consumir monitores — nunca importan `model.py`/`repository.py`
de este módulo directamente. Simétricamente, este módulo consume
`comunidad` y `programacion` exclusivamente vía `comunidad.service`/
`programacion.service` (nunca `.model`/`.repository` de esos módulos),
la misma regla dura que ya aplica en `programacion.service`.

Casos de uso previstos para el futuro módulo `llaves` (diseñado pensando
en ese consumo, igual que hizo `comunidad.service` para `monitores`):
- `listar_monitorias_del_monitor(monitor_delegado_id)` — equivalente al
  `findByDocumentoMonitor` del legacy (ver
  AulaSync/analisis/backend/monitores.md §3 y §6): resuelve "¿esta
  persona es monitor delegado de alguien?" durante la resolución de
  identidad por NFC, sin que `llaves` importe `monitores.model`/
  `repository`. Solo devuelve monitorías con `activo=True`: una
  monitoría desactivada (soft-delete) no debe seguir habilitando
  delegación de llaves — sería el mismo bug de "acceso fantasma" que la
  columna `activo` existe para evitar.
- `clases_del_docente_titular(monitor_id)` — portado de
  `MonitorService.clasesDocente()` del legacy (ver monitores.md, diagrama
  de dependencias: `MonitorService --> ProgramacionRepository :
  findByDocumento`). Resuelve la monitoría, obtiene su
  `docente_titular_id`, y devuelve las clases de `programacion` de ese
  docente vía `programacion.service.listar_programaciones_por_docente`
  (agregado a ese módulo para este consumo, ver su propio docstring).

Validación de `crear_monitor`: además del patrón ya establecido
(`comunidad.service.crear_persona`, `programacion.service.
crear_programacion`) de validar que las referencias a otras entidades
existan antes de dejar propagar el `IntegrityError` crudo de Postgres,
se anticipa acá el `CHECK (docente_titular_id != monitor_delegado_id)`
del DDL con `domain.validar_docente_distinto_de_monitor` (ver ese
módulo), para devolver un `ValueError` claro en vez del error de base de
datos crudo.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT/UPDATE de una sola tabla, ya atómico de por
sí en Django (autocommit por sentencia).
"""

from comunidad import service as comunidad_service
from monitores import domain, repository
from programacion import service as programacion_service


def listar_monitores():
    return repository.listar_monitores()


def crear_monitor(
    docente_titular_id,
    monitor_delegado_id,
    materia: str,
    aula: str | None = None,
    dia: str | None = None,
    horario: str | None = None,
):
    """Crea un Monitor validando primero que docente_titular/monitor_
    delegado existan en comunidad y que no sean la misma persona. Lanza
    ValueError claro en ambos casos, en vez de dejar propagar el
    IntegrityError crudo de Postgres.
    """
    if comunidad_service.obtener_persona(docente_titular_id) is None:
        raise ValueError(f"No existe un docente_titular (comunidad) con id {docente_titular_id}")
    if comunidad_service.obtener_persona(monitor_delegado_id) is None:
        raise ValueError(f"No existe un monitor_delegado (comunidad) con id {monitor_delegado_id}")
    domain.validar_docente_distinto_de_monitor(docente_titular_id, monitor_delegado_id)
    return repository.crear_monitor(
        docente_titular_id,
        monitor_delegado_id,
        materia,
        aula=aula,
        dia=dia,
        horario=horario,
    )


def obtener_monitor(monitor_id):
    """Devuelve el Monitor con ese id, o None si no existe."""
    return repository.obtener_por_id(monitor_id)


def listar_monitorias_del_monitor(monitor_delegado_id):
    """Todas las monitorías ACTIVAS en las que esa persona es el monitor
    delegado — consulta principal para que el futuro `llaves` resuelva
    "¿esta persona es monitor de alguien?" sin importar
    `monitores.model`/`repository` (ver docstring del módulo)."""
    return [
        monitoria
        for monitoria in repository.listar_por_monitor_delegado(monitor_delegado_id)
        if monitoria.activo
    ]


def clases_del_docente_titular(monitor_id):
    """Devuelve las clases (`programacion`) del docente titular de la
    monitoría `monitor_id`, o None si la monitoría no existe.

    Portado de `MonitorService.clasesDocente()` del legacy (ver
    docstring del módulo): resuelve la monitoría, obtiene su
    `docente_titular_id`, y delega en
    `programacion.service.listar_programaciones_por_docente` — nunca
    consulta `programacion.model`/`repository` directamente.
    """
    monitoria = repository.obtener_por_id(monitor_id)
    if monitoria is None:
        return None
    return programacion_service.listar_programaciones_por_docente(
        monitoria.docente_titular_id
    )


def desactivar_monitor(monitor_id):
    """Soft-delete: pone activo=False en la monitoría, o devuelve None si
    no existe. Mismo patrón que `usuarios.service.desactivar_usuario` —
    nunca un DELETE físico (ver model.py, nota de diseño sobre `activo`).
    """
    return repository.desactivar_monitor(monitor_id)
