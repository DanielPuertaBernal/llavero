"""
repository.py — única capa del módulo comunidad que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la
única entidad que este módulo posee: comunidad.

`obtener_por_documento` y `obtener_por_carnet` son las dos consultas más
importantes de este módulo: los futuros módulos `llaves` (resolución de
identidad por NFC), `monitores`, `notificaciones`, `reservas` y
`reservas_semestrales` resuelven personas por esas dos claves, nunca por
`id` interno (que no conocen desde fuera).
"""

from comunidad.model import Comunidad


def listar_comunidad():
    return list(Comunidad.objects.order_by("nombre"))


def crear_persona(
    numero_documento: str,
    nombre: str,
    tipo_persona_id,
    id_carnet: str | None = None,
    correo: str | None = None,
    numero_contacto: str | None = None,
    facultad: str | None = None,
) -> Comunidad:
    return Comunidad.objects.create(
        numero_documento=numero_documento,
        nombre=nombre,
        tipo_persona_id=tipo_persona_id,
        id_carnet=id_carnet,
        correo=correo,
        numero_contacto=numero_contacto,
        facultad=facultad,
    )


def obtener_por_id(persona_id):
    return Comunidad.objects.filter(id=persona_id).first()


def obtener_por_documento(numero_documento: str):
    return Comunidad.objects.filter(numero_documento=numero_documento).first()


def obtener_por_carnet(id_carnet: str):
    return Comunidad.objects.filter(id_carnet=id_carnet).first()


def actualizar_persona(
    persona_id,
    nombre: str,
    tipo_persona_id,
    id_carnet: str | None = None,
    correo: str | None = None,
    numero_contacto: str | None = None,
    facultad: str | None = None,
):
    """Actualiza todos los campos editables (todo menos `numero_documento`,
    la clave natural inmutable) de la persona con ese id, o devuelve None
    si no existe.

    Usado por `service.crear_o_actualizar_por_documento` (upsert del ETL
    externo) en la rama de actualización — ver ese método para el
    contrato completo.
    """
    persona = Comunidad.objects.filter(id=persona_id).first()
    if persona is None:
        return None
    persona.nombre = nombre
    persona.tipo_persona_id = tipo_persona_id
    persona.id_carnet = id_carnet
    persona.correo = correo
    persona.numero_contacto = numero_contacto
    persona.facultad = facultad
    persona.save(
        update_fields=[
            "nombre",
            "tipo_persona_id",
            "id_carnet",
            "correo",
            "numero_contacto",
            "facultad",
        ]
    )
    return persona


def eliminar_persona(persona_id) -> bool:
    """Hard delete físico: el DDL de comunidad no tiene columna `activo`,
    así que no hay soft-delete posible con este esquema (a diferencia de
    `usuario`). Devuelve True si había una fila para borrar, False si no
    existía.
    """
    eliminados, _ = Comunidad.objects.filter(id=persona_id).delete()
    return eliminados > 0
