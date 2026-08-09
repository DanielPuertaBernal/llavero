"""
service.py — API pública del módulo configuracion.

Es el ÚNICO punto de entrada que otros módulos (sobre todo el futuro
`notificaciones`, motor de vencimiento de préstamos de llaves) deben usar
para consumir configuracion — nunca importan `model.py`/`repository.py`
de este módulo directamente. Simétricamente, este módulo consume
`catalogos` exclusivamente vía `catalogos.service` (nunca
`catalogos.model`/`catalogos.repository`), la misma regla dura que ya
aplican `usuarios.service`/`comunidad.service`.

DECISIÓN DE DISEÑO — configuracion como singleton de aplicación
==================================================================
El DDL modela `configuracion` como una tabla plana sin `nombre_bloque`,
sin relación con `bloque`, con un único FK a `ubicacion_defecto_id`: es,
en la práctica, configuración GLOBAL única del sistema, no configuración
por bloque. Esto reemplaza deliberadamente al legacy (Mongo
`configuracion_bloques`: una fila POR bloque + un documento
pseudo-singleton `__defaults__`, con una cascada de resolución de 3
niveles —config del bloque → `__defaults__` → constantes hardcodeadas—
que tenía DOS conjuntos de defaults divergentes entre sí, un bug real de
auditoría, ver AulaSync/analisis/backend/configuracion.md §5 y §7). Ese
modelo de "config por bloque" NO se replica acá: fue una decisión ya
tomada al diseñar el DDL nuevo, no algo que este módulo deba reintroducir.

Pero el DDL NO declara ningún `UNIQUE`/`CHECK` que fuerce una sola fila a
nivel de base de datos. La tabla, tal cual está escrita, admite N filas.
Conceptualmente debería existir una sola fila viva a la vez — la decisión
de cómo modelar ese singleton a nivel de aplicación es la más importante
de este módulo, y quedó así:

1. `obtener_configuracion()` es un GET-OR-CREATE, no un simple `.first()`.
   A diferencia de la convención `dict.get()` que usa el resto de
   `obtener_*` del proyecto (`catalogos.service.obtener_rol`,
   `usuarios.service.obtener_usuario`, etc. — devuelven `None` si no
   existe y dejan la decisión a quien llama), acá se decidió que
   `obtener_configuracion()` NUNCA devuelve `None`: si la tabla está
   vacía (primer arranque del sistema, antes de que un admin la
   configure explícitamente), crea automáticamente la única fila con los
   defaults EXACTOS del DDL (120 minutos, 3 reintentos,
   `plantilla_recordatorio=None`) y la primera Ubicacion disponible en
   catalogos como `ubicacion_defecto_id` provisorio (el seed de
   catalogos, migración 0002, garantiza al menos 3 ubicaciones antes de
   que cualquier otro módulo pueda operar — ver esa migración).

   La razón de fondo: el futuro `notificaciones` va a leer
   `limite_antes_mora_minutos`/`max_reintentos_recordatorio`/
   `plantilla_recordatorio` en su motor de vencimiento en cada corrida
   (probablemente un cron/celery beat) — obligarlo a manejar "todavía no
   hay configuración" en cada lectura sería trasladarle a él una
   responsabilidad que este módulo puede resolver una sola vez, acá. Y a
   diferencia del legacy, hay un ÚNICO lugar con estos defaults (las
   constantes de este archivo), no dos conjuntos divergentes en capas
   distintas — la causa raíz del bug de auditoría no puede repetirse con
   este diseño porque no hay una segunda copia de los defaults en ningún
   otro lado.

2. `crear_configuracion(...)` SÍ refuerza la invariante de fila única:
   lanza `ValueError` si ya existe una fila. No es redundante con el
   punto 1 — `crear_configuracion` es el flujo explícito de un admin
   configurando el sistema por primera vez (vía POST del controller);
   `obtener_configuracion` es el flujo implícito de bootstrap para
   cualquier lector. Permitir que `crear_configuracion` inserte una
   segunda fila dejaría dos configuraciones compitiendo sin que nada en
   el modelo lo impida — mismo espíritu que otros guards de invariante
   de negocio del proyecto (`usuarios.service.crear_usuario` con
   rol/ubicación, `catalogos.service.crear_salon` con bloque/
   tipo_silleteria), solo que acá la referencia inválida es "ya existe
   una fila" en vez de "la fk no existe".

   Para modificar la configuración vigente, el flujo correcto es
   `actualizar_configuracion(...)`, no crear una fila nueva.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura es un único INSERT/UPDATE de una sola tabla, ya atómico de por
sí en Django (autocommit por sentencia).
"""

from catalogos import service as catalogos_service
from configuracion import repository

LIMITE_ANTES_MORA_MINUTOS_DEFECTO = 120
MAX_REINTENTOS_RECORDATORIO_DEFECTO = 3


def crear_configuracion(
    ubicacion_defecto_id,
    limite_antes_mora_minutos: int = LIMITE_ANTES_MORA_MINUTOS_DEFECTO,
    max_reintentos_recordatorio: int = MAX_REINTENTOS_RECORDATORIO_DEFECTO,
    plantilla_recordatorio: str | None = None,
):
    """Crea la fila de configuración, validando primero que la ubicación
    referenciada exista en catalogos (mismo patrón que
    `usuarios.service.crear_usuario`) y que no exista ya una fila previa
    (ver la sección "DECISIÓN DE DISEÑO" arriba: configuracion opera como
    singleton de aplicación, reforzado acá porque el DDL no lo restringe
    con un UNIQUE/CHECK). Lanza ValueError en cualquiera de los dos
    casos, con un mensaje claro de cuál fue.
    """
    if repository.obtener_configuracion() is not None:
        raise ValueError(
            "Ya existe una configuración; use actualizar_configuracion en su lugar"
        )
    if catalogos_service.obtener_ubicacion(ubicacion_defecto_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_defecto_id}")
    return repository.crear_configuracion(
        ubicacion_defecto_id,
        limite_antes_mora_minutos=limite_antes_mora_minutos,
        max_reintentos_recordatorio=max_reintentos_recordatorio,
        plantilla_recordatorio=plantilla_recordatorio,
    )


def obtener_configuracion():
    """Get-or-create de la única fila de configuración: siempre devuelve
    una Configuracion válida, nunca None. Ver la sección "DECISIÓN DE
    DISEÑO" arriba para la justificación completa de por qué esto
    contradice a propósito la convención `dict.get()` que usa el resto de
    `obtener_*` del proyecto.
    """
    configuracion = repository.obtener_configuracion()
    if configuracion is not None:
        return configuracion

    ubicaciones = catalogos_service.listar_ubicaciones()
    if not ubicaciones:
        # No debería pasar en un sistema operando normalmente: el seed de
        # catalogos (migración 0002) siempre deja al menos 3 ubicaciones.
        # Se convierte en un ValueError claro en vez de dejar propagar el
        # IntegrityError crudo de Postgres por el FK NOT NULL, mismo
        # espíritu que el resto de guards de este proyecto.
        raise ValueError(
            "No se puede crear la configuración por defecto: no existe "
            "ninguna ubicacion en catalogos todavía"
        )
    return repository.crear_configuracion(
        ubicaciones[0].id,
        limite_antes_mora_minutos=LIMITE_ANTES_MORA_MINUTOS_DEFECTO,
        max_reintentos_recordatorio=MAX_REINTENTOS_RECORDATORIO_DEFECTO,
        plantilla_recordatorio=None,
    )


def actualizar_configuracion(
    ubicacion_defecto_id,
    limite_antes_mora_minutos: int,
    max_reintentos_recordatorio: int,
    plantilla_recordatorio: str | None = None,
):
    """Actualiza la fila de configuración vigente, validando primero que
    la ubicación referenciada exista en catalogos.

    Se apoya en `obtener_configuracion()` (get-or-create) para resolver
    qué fila actualizar, así quien llama no necesita manejar el caso "no
    existe todavía" antes de poder actualizarla — coherente con la misma
    decisión de diseño que el resto de este módulo.
    """
    if catalogos_service.obtener_ubicacion(ubicacion_defecto_id) is None:
        raise ValueError(f"No existe una ubicacion con id {ubicacion_defecto_id}")
    configuracion = obtener_configuracion()
    return repository.actualizar_configuracion(
        configuracion.id,
        ubicacion_defecto_id,
        limite_antes_mora_minutos,
        max_reintentos_recordatorio,
        plantilla_recordatorio,
    )
