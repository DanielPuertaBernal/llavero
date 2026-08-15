"""
Tests de usuarios/repository.py contra una base de datos de test real
(Postgres, vía pytest-django) — sin mocks, tal como pide la convención
TDD del proyecto.

Los fixtures de rol/ubicacion que necesita usuario (FK NOT NULL a ambas)
se crean vía `catalogos.service` (la API pública de ese módulo), nunca
vía `catalogos.repository`/`catalogos.model` — la regla dura de módulos
("usuarios solo puede importar catalogos.service") aplica también acá,
no solo en el código de producción.
"""

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from usuarios import repository

pytestmark = pytest.mark.django_db


def _rol():
    return catalogos_service.crear_rol("rol-test-usuarios-repo")


def _ubicacion():
    return catalogos_service.crear_ubicacion("ubicacion-test-usuarios-repo")


# ------------------------------------------------------------------
# crear_usuario
# ------------------------------------------------------------------


def test_crear_usuario_lo_persiste_con_los_defaults_del_ddl():
    rol = _rol()
    ubicacion = _ubicacion()

    usuario = repository.crear_usuario(
        "Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id
    )

    assert usuario.id is not None
    assert usuario.nombre == "Ana Pérez"
    assert usuario.email_institucional == "ana.perez@uco.edu.co"
    assert usuario.oid_microsoft is None
    assert usuario.rol_id == rol.id
    assert usuario.ubicacion_id == ubicacion.id
    assert usuario.activo is True


def test_crear_usuario_acepta_activo_explicito():
    rol = _rol()
    ubicacion = _ubicacion()

    usuario = repository.crear_usuario(
        "Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id, activo=False
    )

    assert usuario.activo is False


def test_crear_usuario_con_email_duplicado_falla_por_unicidad():
    rol = _rol()
    ubicacion = _ubicacion()
    repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    with pytest.raises(IntegrityError):
        repository.crear_usuario("Otra Ana", "ana.perez@uco.edu.co", rol.id, ubicacion.id)


def test_crear_usuario_con_rol_inexistente_falla_por_fk():
    # Postgres declara los FK de Django DEFERRABLE INITIALLY DEFERRED, así
    # que el INSERT en sí no falla — el chequeo real ocurre en
    # check_constraints() (Django lo llama recién al hacer rollback del
    # test). Se fuerza aquí para no depender del orden de teardown (ver
    # catalogos/tests/test_repository.py::test_crear_salon_con_bloque_inexistente_falla_por_fk).
    ubicacion = _ubicacion()

    with pytest.raises(IntegrityError):
        repository.crear_usuario(
            "Ana Pérez",
            "ana.perez@uco.edu.co",
            "00000000-0000-0000-0000-000000000000",
            ubicacion.id,
        )
        connection.check_constraints()


def test_crear_usuario_con_ubicacion_inexistente_falla_por_fk():
    rol = _rol()

    with pytest.raises(IntegrityError):
        repository.crear_usuario(
            "Ana Pérez",
            "ana.perez@uco.edu.co",
            rol.id,
            "00000000-0000-0000-0000-000000000000",
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# listar / obtener
# ------------------------------------------------------------------


def test_listar_usuarios():
    rol = _rol()
    ubicacion = _ubicacion()
    repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)
    repository.crear_usuario("Luis Gómez", "luis.gomez@uco.edu.co", rol.id, ubicacion.id)

    nombres = {u.nombre for u in repository.listar_usuarios()}

    assert {"Ana Pérez", "Luis Gómez"} <= nombres


def test_obtener_usuario_por_id():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    assert repository.obtener_usuario_por_id(creado.id).nombre == "Ana Pérez"


def test_obtener_usuario_por_id_inexistente_devuelve_none():
    assert repository.obtener_usuario_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_usuario_por_email():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    assert repository.obtener_usuario_por_email("ana.perez@uco.edu.co").id == creado.id


def test_obtener_usuario_por_email_inexistente_devuelve_none():
    assert repository.obtener_usuario_por_email("no-existe@uco.edu.co") is None


def test_obtener_usuario_por_email_es_case_insensitive():
    # El id_token de Microsoft puede devolver el email con distinta
    # capitalización de dominio (ej. @UCO.EDU.CO) que la almacenada.
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    assert repository.obtener_usuario_por_email("ANA.PEREZ@UCO.EDU.CO").id == creado.id


# ------------------------------------------------------------------
# vincular_oid_microsoft
# ------------------------------------------------------------------


def test_vincular_oid_microsoft_actualiza_el_campo():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = repository.vincular_oid_microsoft(creado.id, "oid-123")

    assert actualizado.oid_microsoft == "oid-123"
    assert repository.obtener_usuario_por_id(creado.id).oid_microsoft == "oid-123"


def test_vincular_oid_microsoft_con_usuario_inexistente_devuelve_none():
    assert repository.vincular_oid_microsoft(
        "00000000-0000-0000-0000-000000000000", "oid-123"
    ) is None


def test_vincular_oid_microsoft_con_oid_duplicado_falla_por_unicidad():
    rol = _rol()
    ubicacion = _ubicacion()
    u1 = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)
    u2 = repository.crear_usuario("Luis Gómez", "luis.gomez@uco.edu.co", rol.id, ubicacion.id)
    repository.vincular_oid_microsoft(u1.id, "oid-123")

    with pytest.raises(IntegrityError):
        repository.vincular_oid_microsoft(u2.id, "oid-123")


# ------------------------------------------------------------------
# actualizar_usuario
# ------------------------------------------------------------------


def test_actualizar_usuario_actualiza_solo_los_campos_provistos():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = repository.actualizar_usuario(creado.id, nombre="Ana María Pérez")

    assert actualizado.nombre == "Ana María Pérez"
    # Los campos no provistos conservan su valor anterior.
    persistido = repository.obtener_usuario_por_id(creado.id)
    assert persistido.nombre == "Ana María Pérez"
    assert persistido.email_institucional == "ana.perez@uco.edu.co"
    assert persistido.rol_id == rol.id
    assert persistido.ubicacion_id == ubicacion.id


def test_actualizar_usuario_sin_campos_provistos_no_cambia_nada():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = repository.actualizar_usuario(creado.id)

    assert actualizado.id == creado.id
    persistido = repository.obtener_usuario_por_id(creado.id)
    assert persistido.nombre == "Ana Pérez"
    assert persistido.email_institucional == "ana.perez@uco.edu.co"


def test_actualizar_usuario_cambia_rol_y_ubicacion():
    rol = _rol()
    ubicacion = _ubicacion()
    otro_rol = catalogos_service.crear_rol("otro-rol-test-usuarios-repo")
    otra_ubicacion = catalogos_service.crear_ubicacion("otra-ubicacion-test-usuarios-repo")
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = repository.actualizar_usuario(
        creado.id, rol_id=otro_rol.id, ubicacion_id=otra_ubicacion.id
    )

    assert actualizado.rol_id == otro_rol.id
    assert actualizado.ubicacion_id == otra_ubicacion.id


def test_actualizar_usuario_no_toca_activo():
    # `activo` no es parte de la firma de actualizar_usuario: activación y
    # desactivación tienen sus propios métodos (ver docstring del módulo).
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario(
        "Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id, activo=False
    )

    repository.actualizar_usuario(creado.id, nombre="Ana María Pérez")

    assert repository.obtener_usuario_por_id(creado.id).activo is False


def test_actualizar_usuario_inexistente_devuelve_none():
    assert (
        repository.actualizar_usuario(
            "00000000-0000-0000-0000-000000000000", nombre="Ana María Pérez"
        )
        is None
    )


def test_actualizar_usuario_con_email_duplicado_falla_por_unicidad():
    rol = _rol()
    ubicacion = _ubicacion()
    repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)
    otro = repository.crear_usuario("Luis Gómez", "luis.gomez@uco.edu.co", rol.id, ubicacion.id)

    with pytest.raises(IntegrityError):
        repository.actualizar_usuario(otro.id, email_institucional="ana.perez@uco.edu.co")


# ------------------------------------------------------------------
# desactivar_usuario
# ------------------------------------------------------------------


def test_desactivar_usuario_pone_activo_en_false():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = repository.desactivar_usuario(creado.id)

    assert actualizado.activo is False
    assert repository.obtener_usuario_por_id(creado.id).activo is False


def test_desactivar_usuario_inexistente_devuelve_none():
    assert repository.desactivar_usuario("00000000-0000-0000-0000-000000000000") is None


# ------------------------------------------------------------------
# reactivar_usuario
# ------------------------------------------------------------------


def test_reactivar_usuario_pone_activo_en_true():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario(
        "Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id, activo=False
    )

    actualizado = repository.reactivar_usuario(creado.id)

    assert actualizado.activo is True
    assert repository.obtener_usuario_por_id(creado.id).activo is True


def test_reactivar_usuario_ya_activo_lo_deja_activo():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = repository.reactivar_usuario(creado.id)

    assert actualizado.activo is True


def test_reactivar_usuario_inexistente_devuelve_none():
    assert repository.reactivar_usuario("00000000-0000-0000-0000-000000000000") is None
