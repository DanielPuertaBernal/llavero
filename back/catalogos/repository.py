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


# ------------------------------------------------------------------
# TipoSilleteria
# ------------------------------------------------------------------


def listar_tipos_silleteria():
    return list(TipoSilleteria.objects.order_by("nombre"))


def crear_tipo_silleteria(nombre: str) -> TipoSilleteria:
    return TipoSilleteria.objects.create(nombre=nombre)


def obtener_tipo_silleteria_por_id(tipo_silleteria_id):
    return TipoSilleteria.objects.filter(id=tipo_silleteria_id).first()


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
