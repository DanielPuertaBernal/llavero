"""
service.py — API pública del módulo comunidad.

Es el ÚNICO punto de entrada que otros módulos deben usar para consumir
comunidad — nunca importan `model.py`/`repository.py` de este módulo
directamente. Simétricamente, este módulo consume `catalogos`
exclusivamente vía `catalogos.service` (nunca `catalogos.model`/
`catalogos.repository`), la misma regla dura que ya aplica en
`usuarios.service`.

Casos de uso previstos para otros módulos (diseñado pensando en ese
consumo futuro, igual que hizo `catalogos.service` para `usuarios`):
- `llaves` (resolución de identidad al leer un carnet por NFC) necesita
  `obtener_por_carnet(id_carnet)`.
- `monitores`/`notificaciones`/`reservas`/`reservas_semestrales`
  necesitan `obtener_por_documento(numero_documento)`.
Ambas devuelven `None` cuando no existe, igual convención `dict.get()`
que ya usan `catalogos`/`equipos`/`usuarios` — la decisión de qué hacer
ante "no existe" (404, ValueError, etc.) queda del lado de quien llama.

Sincronización masiva del ETL externo (ver
AulaSync/analisis/estrategia-migracion/backend.md, sección "Modelo de
datos: sin migración..."): un sistema externo empuja registros (nombre,
tipo, código de carnet) a un endpoint protegido con API key. El legacy
(`ComunidadService.sync`, ver AulaSync/analisis/backend/comunidad.md
§4.1 y §5) validaba el batch completo con `.map()` síncrono —un solo
registro inválido abortaba TODO el lote— y perpetraba el upsert con
`bulkWrite(ordered:false)`, dejando estado parcial invisible si algo
fallaba a mitad de lote. Ese comportamiento no se replica acá:
`crear_o_actualizar_por_documento` es una operación atómica y
autocontenida sobre UNA persona (un INSERT o un UPDATE, sin ambigüedad
de "todo o nada" de lote, porque no hay lote a este nivel). Si el
futuro endpoint HTTP de sync masivo lo necesita, debe iterar llamando a
esta función registro por registro y agregar sus propios resultados/
errores por índice — la lógica de "todo o nada" del legacy no se
traslada.

No se agrega acá el endpoint HTTP `POST /sync` en sí: la protección con
API key es responsabilidad de un futuro middleware/auth que todavía no
existe en este backend (no hay módulo `auth` construido); agregar el
endpoint ahora sin esa protección repetiría el hallazgo de auditoría del
legacy (`POST /api/comunidad/sync` público sin ninguna mitigación, ver
comunidad.md §7). Este método de service queda listo para que ese
endpoint lo use en cuanto el middleware de API key exista.

No se usa `transaction.atomic()` en este módulo: cada operación de
escritura (crear, actualizar, eliminar) es un único INSERT/UPDATE/DELETE
de una sola tabla, ya atómico de por sí en Django (autocommit por
sentencia).
"""

from catalogos import service as catalogos_service
from comunidad import repository


def listar_comunidad():
    return repository.listar_comunidad()


def crear_persona(
    numero_documento: str,
    nombre: str,
    tipo_persona_id,
    id_carnet: str | None = None,
    correo: str | None = None,
    numero_contacto: str | None = None,
    facultad: str | None = None,
):
    """Crea una persona de comunidad validando primero que el tipo_persona
    referenciado exista en catalogos, para devolver un ValueError claro
    en vez de dejar propagar el IntegrityError crudo de Postgres.
    """
    if catalogos_service.obtener_tipo_persona(tipo_persona_id) is None:
        raise ValueError(f"No existe un tipo_persona con id {tipo_persona_id}")
    return repository.crear_persona(
        numero_documento,
        nombre,
        tipo_persona_id,
        id_carnet=id_carnet,
        correo=correo,
        numero_contacto=numero_contacto,
        facultad=facultad,
    )


def obtener_persona(persona_id):
    """Devuelve la persona con ese id, o None si no existe."""
    return repository.obtener_por_id(persona_id)


def obtener_por_documento(numero_documento: str):
    """Devuelve la persona con ese numero_documento, o None si no existe.

    Consulta principal para los módulos consumidores que resuelven
    identidad por documento (monitores, notificaciones, reservas,
    reservas_semestrales).
    """
    return repository.obtener_por_documento(numero_documento)


def obtener_por_carnet(id_carnet: str):
    """Devuelve la persona con ese id_carnet, o None si no existe.

    Consulta principal del futuro flujo de préstamo de llaves por NFC:
    a diferencia del legacy (ver model.py, nota sobre unicidad
    condicional), acá `id_carnet` es único a nivel de base de datos, así
    que esta función nunca puede resolver una identidad ambigua entre
    dos personas — el `IntegrityError` de la constraint ya impidió que
    esa situación llegara a existir.
    """
    return repository.obtener_por_carnet(id_carnet)


def crear_o_actualizar_por_documento(
    numero_documento: str,
    nombre: str,
    tipo_persona_id,
    id_carnet: str | None = None,
    correo: str | None = None,
    numero_contacto: str | None = None,
    facultad: str | None = None,
):
    """Upsert por `numero_documento` (la clave natural del ETL externo):
    crea la persona si no existe, o actualiza sus campos si ya existe.

    Pensado para que el futuro endpoint HTTP de sync masivo del ETL lo
    invoque una vez por registro (ver el docstring de este módulo para
    la corrección deliberada respecto al "todo o nada" del legacy).

    Lanza ValueError si `tipo_persona_id` no existe en catalogos, igual
    contrato que `crear_persona`.
    """
    if catalogos_service.obtener_tipo_persona(tipo_persona_id) is None:
        raise ValueError(f"No existe un tipo_persona con id {tipo_persona_id}")

    existente = repository.obtener_por_documento(numero_documento)
    if existente is None:
        return repository.crear_persona(
            numero_documento,
            nombre,
            tipo_persona_id,
            id_carnet=id_carnet,
            correo=correo,
            numero_contacto=numero_contacto,
            facultad=facultad,
        )
    return repository.actualizar_persona(
        existente.id,
        nombre,
        tipo_persona_id,
        id_carnet=id_carnet,
        correo=correo,
        numero_contacto=numero_contacto,
        facultad=facultad,
    )


def eliminar_persona(persona_id) -> bool:
    """Hard delete: el DDL de comunidad no tiene columna `activo`, así que
    no hay soft-delete posible con este esquema (a diferencia de
    `usuario`, ver `usuarios.service.desactivar_usuario`). Mismo
    comportamiento que el legacy (DELETE físico) — no es una regresión,
    es lo que el DDL permite. Devuelve True si había una fila para
    borrar, False si no existía.
    """
    return repository.eliminar_persona(persona_id)
