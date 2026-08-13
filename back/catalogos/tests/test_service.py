"""
Tests de catalogos/service.py — solo la lógica que agrega valor sobre el
repository (la validación de FKs de crear_salon/actualizar_salon, y los
guards de actualizar_*/eliminar_* que traducen "id inexistente" y
`ProtectedError` a un ValueError claro). El resto de funciones del service
son passthrough directo a repository y ya están cubiertas transitivamente
por test_repository.py.

Los tests de "eliminar_* referenciado por otro registro" crean esa
referencia usando el `.service` del módulo consumidor (nunca su
`.model`/`.repository` directamente) — mismo precedente ya usado por
`reservas/tests/test_service.py`, `nfc/tests/test_service.py`, etc. al
importar servicios de otros módulos para armar fixtures cruzados.
"""

import datetime

import pytest

from catalogos import repository, service
from comunidad import service as comunidad_service
from reservas import service as reservas_service
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db

ID_INEXISTENTE = "00000000-0000-0000-0000-000000000000"


def test_crear_salon_con_bloque_inexistente_da_value_error_claro():
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")

    with pytest.raises(ValueError, match="bloque"):
        service.crear_salon("101", "00000000-0000-0000-0000-000000000000", tipo_silleteria.id)


def test_crear_salon_con_tipo_silleteria_inexistente_da_value_error_claro():
    bloque = repository.crear_bloque("Bloque 12")

    with pytest.raises(ValueError, match="tipo_silleteria"):
        service.crear_salon("101", bloque.id, "00000000-0000-0000-0000-000000000000")


def test_crear_salon_con_referencias_validas_delega_al_repository():
    bloque = repository.crear_bloque("Bloque 12")
    tipo_silleteria = repository.crear_tipo_silleteria("Individual")

    salon = service.crear_salon("101", bloque.id, tipo_silleteria.id)

    assert salon.bloque_id == bloque.id
    assert salon.tipo_silleteria_id == tipo_silleteria.id


def test_obtener_rol_inexistente_devuelve_none():
    assert service.obtener_rol("00000000-0000-0000-0000-000000000000") is None


def test_obtener_rol_existente_lo_devuelve():
    # "admin" ya existe por el seed (0002_seed_catalogos_iniciales);
    # se usa un nombre propio del test para no depender de esa fila.
    creado = repository.crear_rol("coordinador")

    assert service.obtener_rol(creado.id).id == creado.id


# ------------------------------------------------------------------
# actualizar_salon / eliminar_salon
# ------------------------------------------------------------------


def test_actualizar_salon_con_bloque_inexistente_da_value_error_claro():
    bloque = repository.crear_bloque("Bloque actualizar salon service")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo actualizar salon service")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    with pytest.raises(ValueError, match="bloque"):
        service.actualizar_salon(salon.id, bloque_id=ID_INEXISTENTE)


def test_actualizar_salon_con_tipo_silleteria_inexistente_da_value_error_claro():
    bloque = repository.crear_bloque("Bloque actualizar salon service 2")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo actualizar salon service 2")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    with pytest.raises(ValueError, match="tipo_silleteria"):
        service.actualizar_salon(salon.id, tipo_silleteria_id=ID_INEXISTENTE)


def test_actualizar_salon_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="salon"):
        service.actualizar_salon(ID_INEXISTENTE, nombre="x")


def test_actualizar_salon_con_referencias_validas_delega_al_repository():
    bloque_1 = repository.crear_bloque("Bloque actualizar salon service 3")
    bloque_2 = repository.crear_bloque("Bloque actualizar salon service 4")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo actualizar salon service 3")
    salon = repository.crear_salon("101", bloque_1.id, tipo_silleteria.id)

    actualizado = service.actualizar_salon(salon.id, bloque_id=bloque_2.id)

    assert actualizado.bloque_id == bloque_2.id


def test_eliminar_salon_happy_path():
    bloque = repository.crear_bloque("Bloque eliminar salon service")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo eliminar salon service")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    service.eliminar_salon(salon.id)

    assert repository.obtener_salon_por_id(salon.id) is None


def test_eliminar_salon_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="salon"):
        service.eliminar_salon(ID_INEXISTENTE)


def test_eliminar_salon_referenciado_por_reserva_da_value_error_claro():
    # Fixture cruzada vía reservas.service/comunidad.service (nunca vía
    # .model/.repository de esos módulos), ver docstring del módulo.
    bloque = repository.crear_bloque("Bloque salon protegido")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo salon protegido")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)
    tipo_persona = repository.crear_tipo_persona("tipo-persona-salon-protegido")
    solicitante = comunidad_service.crear_persona(
        "doc-salon-protegido", "Solicitante de prueba", tipo_persona.id
    )
    reservas_service.crear_reserva(
        salon.id,
        solicitante.id,
        datetime.date(2030, 1, 1),
        datetime.time(8, 0),
        datetime.time(9, 0),
    )

    with pytest.raises(ValueError, match="salon"):
        service.eliminar_salon(salon.id)


# ------------------------------------------------------------------
# actualizar_*/eliminar_* — Rol, TipoPersona, Ubicacion, Bloque,
# TipoSilleteria
# ------------------------------------------------------------------


def test_actualizar_rol_happy_path():
    rol = repository.crear_rol("rol-service-editable")

    actualizado = service.actualizar_rol(rol.id, nombre="rol-service-editado")

    assert actualizado.nombre == "rol-service-editado"


def test_actualizar_rol_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="rol"):
        service.actualizar_rol(ID_INEXISTENTE, nombre="x")


def test_eliminar_rol_happy_path():
    rol = repository.crear_rol("rol-service-descartable")

    service.eliminar_rol(rol.id)

    assert repository.obtener_rol_por_id(rol.id) is None


def test_eliminar_rol_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="rol"):
        service.eliminar_rol(ID_INEXISTENTE)


def test_eliminar_rol_referenciado_por_usuario_da_value_error_claro():
    rol = repository.crear_rol("rol-service-en-uso")
    ubicacion = repository.crear_ubicacion("Ubicacion rol en uso")
    usuarios_service.crear_usuario(
        "Usuario de prueba rol", "usuario-rol-en-uso@uco.edu.co", rol.id, ubicacion.id
    )

    with pytest.raises(ValueError, match="rol"):
        service.eliminar_rol(rol.id)


def test_actualizar_tipo_persona_happy_path():
    tipo_persona = repository.crear_tipo_persona("tipo-persona-service-editable")

    actualizado = service.actualizar_tipo_persona(
        tipo_persona.id, nombre="tipo-persona-service-editado"
    )

    assert actualizado.nombre == "tipo-persona-service-editado"


def test_actualizar_tipo_persona_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="tipo_persona"):
        service.actualizar_tipo_persona(ID_INEXISTENTE, nombre="x")


def test_eliminar_tipo_persona_happy_path():
    tipo_persona = repository.crear_tipo_persona("tipo-persona-svc-descartable")

    service.eliminar_tipo_persona(tipo_persona.id)

    assert repository.obtener_tipo_persona_por_id(tipo_persona.id) is None


def test_eliminar_tipo_persona_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="tipo_persona"):
        service.eliminar_tipo_persona(ID_INEXISTENTE)


def test_eliminar_tipo_persona_referenciado_por_comunidad_da_value_error_claro():
    tipo_persona = repository.crear_tipo_persona("tipo-persona-service-en-uso")
    comunidad_service.crear_persona(
        "doc-tp-en-uso", "Persona de prueba", tipo_persona.id
    )

    with pytest.raises(ValueError, match="tipo_persona"):
        service.eliminar_tipo_persona(tipo_persona.id)


def test_actualizar_ubicacion_happy_path():
    ubicacion = repository.crear_ubicacion("Ubicacion service editable")

    actualizada = service.actualizar_ubicacion(ubicacion.id, permite_prestamo_equipos=True)

    assert actualizada.permite_prestamo_equipos is True


def test_actualizar_ubicacion_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="ubicacion"):
        service.actualizar_ubicacion(ID_INEXISTENTE, nombre="x")


def test_eliminar_ubicacion_happy_path():
    ubicacion = repository.crear_ubicacion("Ubicacion service descartable")

    service.eliminar_ubicacion(ubicacion.id)

    assert repository.obtener_ubicacion_por_id(ubicacion.id) is None


def test_eliminar_ubicacion_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="ubicacion"):
        service.eliminar_ubicacion(ID_INEXISTENTE)


def test_eliminar_ubicacion_referenciada_por_usuario_da_value_error_claro():
    ubicacion = repository.crear_ubicacion("Ubicacion service en uso")
    rol = repository.crear_rol("rol-ubicacion-en-uso")
    usuarios_service.crear_usuario(
        "Usuario de prueba ubicacion", "usuario-ubicacion-en-uso@uco.edu.co", rol.id, ubicacion.id
    )

    with pytest.raises(ValueError, match="ubicacion"):
        service.eliminar_ubicacion(ubicacion.id)


def test_actualizar_bloque_happy_path():
    bloque = repository.crear_bloque("bloque-service-editable")

    actualizado = service.actualizar_bloque(bloque.id, nombre="bloque-service-editado")

    assert actualizado.nombre == "bloque-service-editado"


def test_actualizar_bloque_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="bloque"):
        service.actualizar_bloque(ID_INEXISTENTE, nombre="x")


def test_eliminar_bloque_happy_path():
    bloque = repository.crear_bloque("bloque-service-descartable")

    service.eliminar_bloque(bloque.id)

    assert repository.obtener_bloque_por_id(bloque.id) is None


def test_eliminar_bloque_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="bloque"):
        service.eliminar_bloque(ID_INEXISTENTE)


def test_eliminar_bloque_referenciado_por_salon_da_value_error_claro():
    bloque = repository.crear_bloque("bloque-service-en-uso")
    tipo_silleteria = repository.crear_tipo_silleteria("tipo-silleteria-bloque-en-uso")
    repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    with pytest.raises(ValueError, match="bloque"):
        service.eliminar_bloque(bloque.id)


def test_actualizar_tipo_silleteria_happy_path():
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-service-editable")

    actualizado = service.actualizar_tipo_silleteria(
        tipo_silleteria.id, nombre="silleteria-service-editado"
    )

    assert actualizado.nombre == "silleteria-service-editado"


def test_actualizar_tipo_silleteria_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="tipo_silleteria"):
        service.actualizar_tipo_silleteria(ID_INEXISTENTE, nombre="x")


def test_eliminar_tipo_silleteria_happy_path():
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-service-descartable")

    service.eliminar_tipo_silleteria(tipo_silleteria.id)

    assert repository.obtener_tipo_silleteria_por_id(tipo_silleteria.id) is None


def test_eliminar_tipo_silleteria_con_id_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="tipo_silleteria"):
        service.eliminar_tipo_silleteria(ID_INEXISTENTE)


def test_eliminar_tipo_silleteria_referenciada_por_salon_da_value_error_claro():
    bloque = repository.crear_bloque("bloque-tipo-silleteria-en-uso")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-service-en-uso")
    repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    with pytest.raises(ValueError, match="tipo_silleteria"):
        service.eliminar_tipo_silleteria(tipo_silleteria.id)


# ------------------------------------------------------------------
# Unicidad — un choque de unicidad causado por datos del usuario se
# valida acá y sale como ValueError claro (nunca como IntegrityError
# crudo que el controller no puede traducir a un 400 con {detail}).
# Los nombres de fixture se mantienen cortos a propósito: `Rol.nombre` y
# `Salon.nombre` son varchar(30) en el DDL.
# ------------------------------------------------------------------


def test_crear_rol_con_nombre_duplicado_da_value_error_claro():
    repository.crear_rol("rol-dup")

    with pytest.raises(ValueError, match="Ya existe un rol"):
        service.crear_rol("rol-dup")


def test_crear_rol_con_nombre_libre_lo_crea():
    creado = service.crear_rol("rol-libre")

    assert creado.nombre == "rol-libre"


def test_actualizar_rol_con_nombre_de_otro_rol_da_value_error_claro():
    repository.crear_rol("rol-ocupado")
    rol = repository.crear_rol("rol-a-renombrar")

    with pytest.raises(ValueError, match="Ya existe un rol"):
        service.actualizar_rol(rol.id, nombre="rol-ocupado")


def test_actualizar_rol_con_su_propio_nombre_no_da_error():
    rol = repository.crear_rol("rol-mismo-nombre")

    actualizado = service.actualizar_rol(rol.id, nombre="rol-mismo-nombre")

    assert actualizado.nombre == "rol-mismo-nombre"


def test_crear_tipo_persona_con_nombre_duplicado_da_value_error_claro():
    repository.crear_tipo_persona("tp-dup")

    with pytest.raises(ValueError, match="Ya existe un tipo_persona"):
        service.crear_tipo_persona("tp-dup")


def test_actualizar_tipo_persona_con_nombre_de_otro_da_value_error_claro():
    repository.crear_tipo_persona("tp-ocupado")
    tipo_persona = repository.crear_tipo_persona("tp-a-renombrar")

    with pytest.raises(ValueError, match="Ya existe un tipo_persona"):
        service.actualizar_tipo_persona(tipo_persona.id, nombre="tp-ocupado")


def test_actualizar_tipo_persona_con_su_propio_nombre_no_da_error():
    tipo_persona = repository.crear_tipo_persona("tp-mismo-nombre")

    actualizado = service.actualizar_tipo_persona(
        tipo_persona.id, nombre="tp-mismo-nombre"
    )

    assert actualizado.nombre == "tp-mismo-nombre"


def test_crear_bloque_con_nombre_duplicado_da_value_error_claro():
    repository.crear_bloque("Bloque dup")

    with pytest.raises(ValueError, match="Ya existe un bloque"):
        service.crear_bloque("Bloque dup")


def test_actualizar_bloque_con_nombre_de_otro_da_value_error_claro():
    repository.crear_bloque("Bloque ocupado")
    bloque = repository.crear_bloque("Bloque a renombrar")

    with pytest.raises(ValueError, match="Ya existe un bloque"):
        service.actualizar_bloque(bloque.id, nombre="Bloque ocupado")


def test_actualizar_bloque_con_su_propio_nombre_no_da_error():
    bloque = repository.crear_bloque("Bloque mismo nombre")

    actualizado = service.actualizar_bloque(bloque.id, nombre="Bloque mismo nombre")

    assert actualizado.nombre == "Bloque mismo nombre"


def test_crear_tipo_silleteria_con_nombre_duplicado_da_value_error_claro():
    repository.crear_tipo_silleteria("silleteria-dup")

    with pytest.raises(ValueError, match="Ya existe un tipo_silleteria"):
        service.crear_tipo_silleteria("silleteria-dup")


def test_actualizar_tipo_silleteria_con_nombre_de_otro_da_value_error_claro():
    repository.crear_tipo_silleteria("silleteria-ocupada")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-renombrar")

    with pytest.raises(ValueError, match="Ya existe un tipo_silleteria"):
        service.actualizar_tipo_silleteria(
            tipo_silleteria.id, nombre="silleteria-ocupada"
        )


def test_actualizar_tipo_silleteria_con_su_propio_nombre_no_da_error():
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-misma")

    actualizado = service.actualizar_tipo_silleteria(
        tipo_silleteria.id, nombre="silleteria-misma"
    )

    assert actualizado.nombre == "silleteria-misma"


def test_crear_ubicacion_con_nombre_repetido_no_da_error():
    # `Ubicacion.nombre` NO es único en el DDL (ni columna UNIQUE ni
    # UniqueConstraint, ver model.py): dos ubicaciones homónimas son
    # legítimas y no se les inventa una validación de unicidad.
    service.crear_ubicacion("Porteria principal")

    segunda = service.crear_ubicacion("Porteria principal")

    assert segunda.nombre == "Porteria principal"


def test_crear_salon_con_nombre_duplicado_en_el_mismo_bloque_da_value_error_claro():
    bloque = repository.crear_bloque("Bloque salon dup")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-salon-dup")
    repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    with pytest.raises(ValueError, match="Ya existe un salon"):
        service.crear_salon("101", bloque.id, tipo_silleteria.id)


def test_crear_salon_con_el_mismo_nombre_en_otro_bloque_lo_crea():
    # La unicidad de Salon es del PAR (nombre, bloque), no del nombre
    # solo: `uq_salon_nombre_bloque`.
    bloque_1 = repository.crear_bloque("Bloque salon par 1")
    bloque_2 = repository.crear_bloque("Bloque salon par 2")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-salon-par")
    repository.crear_salon("101", bloque_1.id, tipo_silleteria.id)

    creado = service.crear_salon("101", bloque_2.id, tipo_silleteria.id)

    assert creado.bloque_id == bloque_2.id


def test_actualizar_salon_a_un_par_nombre_bloque_ocupado_da_value_error_claro():
    bloque = repository.crear_bloque("Bloque salon patch dup")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-salon-patch")
    repository.crear_salon("101", bloque.id, tipo_silleteria.id)
    salon = repository.crear_salon("102", bloque.id, tipo_silleteria.id)

    with pytest.raises(ValueError, match="Ya existe un salon"):
        service.actualizar_salon(salon.id, nombre="101")


def test_actualizar_salon_con_su_propio_par_nombre_bloque_no_da_error():
    bloque = repository.crear_bloque("Bloque salon patch propio")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-salon-propio")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)

    actualizado = service.actualizar_salon(salon.id, nombre="101", cantidad_sillas=30)

    assert actualizado.cantidad_sillas == 30


def test_actualizar_salon_moviendolo_a_un_bloque_con_ese_nombre_da_value_error_claro():
    # Solo cambia `bloque_id`: el par resultante (nombre actual, bloque
    # nuevo) también debe validarse, no solo el nombre entrante.
    bloque_1 = repository.crear_bloque("Bloque salon mueve 1")
    bloque_2 = repository.crear_bloque("Bloque salon mueve 2")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-salon-mueve")
    repository.crear_salon("101", bloque_2.id, tipo_silleteria.id)
    salon = repository.crear_salon("101", bloque_1.id, tipo_silleteria.id)

    with pytest.raises(ValueError, match="Ya existe un salon"):
        service.actualizar_salon(salon.id, bloque_id=bloque_2.id)
