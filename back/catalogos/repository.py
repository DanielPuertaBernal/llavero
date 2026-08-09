"""
repository.py — única capa del módulo catalogos que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para las 6
entidades que este módulo posee: rol, tipo_persona, ubicacion, bloque,
tipo_silleteria, salon.
"""

from catalogos.model import Bloque, Rol, Salon, TipoPersona, TipoSilleteria, Ubicacion

# ------------------------------------------------------------------
# Rol
# ------------------------------------------------------------------


def listar_roles():
    return list(Rol.objects.order_by("nombre"))


def crear_rol(nombre: str) -> Rol:
    return Rol.objects.create(nombre=nombre)


def obtener_rol_por_id(rol_id):
    return Rol.objects.filter(id=rol_id).first()


def obtener_rol_por_nombre(nombre: str):
    return Rol.objects.filter(nombre=nombre).first()


def actualizar_rol(rol_id, nombre: str | None = None):
    """Actualiza solo los campos provistos (distintos de None) del Rol con
    ese id, o devuelve None si no existe. `nombre=None` significa "no
    cambiar este campo", no "poner nombre en null" — igual convención que
    el resto de `actualizar_*` de este módulo (ver docstring de
    `actualizar_ubicacion`, donde la distinción importa más porque ahí
    hay campos booleanos)."""
    rol = Rol.objects.filter(id=rol_id).first()
    if rol is None:
        return None
    campos = []
    if nombre is not None:
        rol.nombre = nombre
        campos.append("nombre")
    if campos:
        rol.save(update_fields=campos)
    return rol


def eliminar_rol(rol_id) -> bool:
    """Hard delete. Devuelve True si había una fila para borrar, False si
    no existía. Lanza `django.db.models.deletion.ProtectedError` sin
    capturarla si el rol todavía está referenciado (p. ej. por
    `usuarios.model.Usuario.rol`, `on_delete=PROTECT`) — es
    responsabilidad de `service.py` traducir eso a un ValueError claro."""
    eliminados, _ = Rol.objects.filter(id=rol_id).delete()
    return eliminados > 0


# ------------------------------------------------------------------
# TipoPersona
# ------------------------------------------------------------------


def listar_tipos_persona():
    return list(TipoPersona.objects.order_by("nombre"))


def crear_tipo_persona(nombre: str) -> TipoPersona:
    return TipoPersona.objects.create(nombre=nombre)


def obtener_tipo_persona_por_id(tipo_persona_id):
    return TipoPersona.objects.filter(id=tipo_persona_id).first()


def obtener_tipo_persona_por_nombre(nombre: str):
    return TipoPersona.objects.filter(nombre=nombre).first()


def actualizar_tipo_persona(tipo_persona_id, nombre: str | None = None):
    """Ver docstring de `actualizar_rol` (mismo patrón: un solo campo
    editable, `nombre=None` significa "no cambiar")."""
    tipo_persona = TipoPersona.objects.filter(id=tipo_persona_id).first()
    if tipo_persona is None:
        return None
    campos = []
    if nombre is not None:
        tipo_persona.nombre = nombre
        campos.append("nombre")
    if campos:
        tipo_persona.save(update_fields=campos)
    return tipo_persona


def eliminar_tipo_persona(tipo_persona_id) -> bool:
    """Ver docstring de `eliminar_rol`. Referenciado por
    `comunidad.model.Comunidad.tipo_persona`, `on_delete=PROTECT`."""
    eliminados, _ = TipoPersona.objects.filter(id=tipo_persona_id).delete()
    return eliminados > 0


# ------------------------------------------------------------------
# Ubicacion
# ------------------------------------------------------------------


def listar_ubicaciones():
    return list(Ubicacion.objects.order_by("nombre"))


def crear_ubicacion(
    nombre: str,
    permite_prestamo_llaves: bool = True,
    permite_devolucion_llaves: bool = True,
    permite_prestamo_equipos: bool = False,
) -> Ubicacion:
    return Ubicacion.objects.create(
        nombre=nombre,
        permite_prestamo_llaves=permite_prestamo_llaves,
        permite_devolucion_llaves=permite_devolucion_llaves,
        permite_prestamo_equipos=permite_prestamo_equipos,
    )


def obtener_ubicacion_por_id(ubicacion_id):
    return Ubicacion.objects.filter(id=ubicacion_id).first()


def listar_ubicaciones_que_permiten_prestamo_llaves():
    return list(Ubicacion.objects.filter(permite_prestamo_llaves=True).order_by("nombre"))


def listar_ubicaciones_que_permiten_prestamo_equipos():
    return list(Ubicacion.objects.filter(permite_prestamo_equipos=True).order_by("nombre"))


def actualizar_ubicacion(
    ubicacion_id,
    nombre: str | None = None,
    permite_prestamo_llaves: bool | None = None,
    permite_devolucion_llaves: bool | None = None,
    permite_prestamo_equipos: bool | None = None,
):
    """Actualiza solo los campos provistos (distintos de None), o devuelve
    None si no existe. `None` significa "no cambiar este campo" — no hay
    forma de expresar "poner en null" con esta firma porque ninguno de
    estos 4 campos es nullable en el DDL (`nombre` es NOT NULL, las 3
    banderas son BooleanField con default, nunca None), así que reusar
    `None` como sentinel de "no provisto" es seguro y no colisiona con
    ningún valor de dominio real."""
    ubicacion = Ubicacion.objects.filter(id=ubicacion_id).first()
    if ubicacion is None:
        return None
    campos = []
    if nombre is not None:
        ubicacion.nombre = nombre
        campos.append("nombre")
    if permite_prestamo_llaves is not None:
        ubicacion.permite_prestamo_llaves = permite_prestamo_llaves
        campos.append("permite_prestamo_llaves")
    if permite_devolucion_llaves is not None:
        ubicacion.permite_devolucion_llaves = permite_devolucion_llaves
        campos.append("permite_devolucion_llaves")
    if permite_prestamo_equipos is not None:
        ubicacion.permite_prestamo_equipos = permite_prestamo_equipos
        campos.append("permite_prestamo_equipos")
    if campos:
        ubicacion.save(update_fields=campos)
    return ubicacion


def eliminar_ubicacion(ubicacion_id) -> bool:
    """Ver docstring de `eliminar_rol`. Referenciado por
    `usuarios.model.Usuario.ubicacion`, `on_delete=PROTECT`."""
    eliminados, _ = Ubicacion.objects.filter(id=ubicacion_id).delete()
    return eliminados > 0


# ------------------------------------------------------------------
# Bloque
# ------------------------------------------------------------------


def listar_bloques():
    return list(Bloque.objects.order_by("nombre"))


def crear_bloque(nombre: str) -> Bloque:
    return Bloque.objects.create(nombre=nombre)


def obtener_bloque_por_id(bloque_id):
    return Bloque.objects.filter(id=bloque_id).first()


def obtener_bloque_por_nombre(nombre: str):
    return Bloque.objects.filter(nombre=nombre).first()


def actualizar_bloque(bloque_id, nombre: str | None = None):
    """Ver docstring de `actualizar_rol`."""
    bloque = Bloque.objects.filter(id=bloque_id).first()
    if bloque is None:
        return None
    campos = []
    if nombre is not None:
        bloque.nombre = nombre
        campos.append("nombre")
    if campos:
        bloque.save(update_fields=campos)
    return bloque


def eliminar_bloque(bloque_id) -> bool:
    """Ver docstring de `eliminar_rol`. Referenciado por
    `catalogos.model.Salon.bloque`, `on_delete=PROTECT`."""
    eliminados, _ = Bloque.objects.filter(id=bloque_id).delete()
    return eliminados > 0


# ------------------------------------------------------------------
# TipoSilleteria
# ------------------------------------------------------------------


def listar_tipos_silleteria():
    return list(TipoSilleteria.objects.order_by("nombre"))


def crear_tipo_silleteria(nombre: str) -> TipoSilleteria:
    return TipoSilleteria.objects.create(nombre=nombre)


def obtener_tipo_silleteria_por_id(tipo_silleteria_id):
    return TipoSilleteria.objects.filter(id=tipo_silleteria_id).first()


def actualizar_tipo_silleteria(tipo_silleteria_id, nombre: str | None = None):
    """Ver docstring de `actualizar_rol`."""
    tipo_silleteria = TipoSilleteria.objects.filter(id=tipo_silleteria_id).first()
    if tipo_silleteria is None:
        return None
    campos = []
    if nombre is not None:
        tipo_silleteria.nombre = nombre
        campos.append("nombre")
    if campos:
        tipo_silleteria.save(update_fields=campos)
    return tipo_silleteria


def eliminar_tipo_silleteria(tipo_silleteria_id) -> bool:
    """Ver docstring de `eliminar_rol`. Referenciado por
    `catalogos.model.Salon.tipo_silleteria`, `on_delete=PROTECT`."""
    eliminados, _ = TipoSilleteria.objects.filter(id=tipo_silleteria_id).delete()
    return eliminados > 0


# ------------------------------------------------------------------
# Salon
# ------------------------------------------------------------------


def listar_salones():
    return list(Salon.objects.order_by("nombre"))


def listar_salones_por_bloque(bloque_id):
    return list(Salon.objects.filter(bloque_id=bloque_id).order_by("nombre"))


def crear_salon(
    nombre: str,
    bloque_id,
    tipo_silleteria_id,
    cantidad_sillas: int = 0,
    cantidad_mesas: int = 0,
) -> Salon:
    return Salon.objects.create(
        nombre=nombre,
        bloque_id=bloque_id,
        tipo_silleteria_id=tipo_silleteria_id,
        cantidad_sillas=cantidad_sillas,
        cantidad_mesas=cantidad_mesas,
    )


def obtener_salon_por_id(salon_id):
    return Salon.objects.filter(id=salon_id).first()


def actualizar_salon(
    salon_id,
    nombre: str | None = None,
    bloque_id=None,
    tipo_silleteria_id=None,
    cantidad_sillas: int | None = None,
    cantidad_mesas: int | None = None,
):
    """Actualiza solo los campos provistos (distintos de None) del Salon
    con ese id, o devuelve None si no existe. Ver docstring de
    `actualizar_ubicacion` sobre por qué `None` como sentinel de "no
    provisto" es seguro acá: ninguno de estos 5 campos es nullable en el
    DDL. No valida las FKs `bloque_id`/`tipo_silleteria_id` — esa
    validación vive en `service.actualizar_salon`, igual separación de
    responsabilidades que `crear_salon`/`service.crear_salon`."""
    salon = Salon.objects.filter(id=salon_id).first()
    if salon is None:
        return None
    campos = []
    if nombre is not None:
        salon.nombre = nombre
        campos.append("nombre")
    if bloque_id is not None:
        salon.bloque_id = bloque_id
        campos.append("bloque_id")
    if tipo_silleteria_id is not None:
        salon.tipo_silleteria_id = tipo_silleteria_id
        campos.append("tipo_silleteria_id")
    if cantidad_sillas is not None:
        salon.cantidad_sillas = cantidad_sillas
        campos.append("cantidad_sillas")
    if cantidad_mesas is not None:
        salon.cantidad_mesas = cantidad_mesas
        campos.append("cantidad_mesas")
    if campos:
        salon.save(update_fields=campos)
    return salon


def eliminar_salon(salon_id) -> bool:
    """Ver docstring de `eliminar_rol`. Referenciado por ejemplo por
    `reservas.model.ReservaIndividual.salon`, `llaves.model.Llave.salon`,
    `programacion.model.Programacion.salon`,
    `reservas_semestrales.model.ReservaSemestral.salon`, todos
    `on_delete=PROTECT`."""
    eliminados, _ = Salon.objects.filter(id=salon_id).delete()
    return eliminados > 0
