"""
Tests de usuarios/service.py — la lógica que agrega valor sobre el
repository: validación de FKs de crear_usuario (contra catalogos.service,
nunca catalogos.repository/model — regla dura del proyecto), la
vinculación de oid_microsoft en el primer login de Office 365, y la
autoprotección de desactivación (domain.validar_desactivacion). Los
passthrough directos ya están cubiertos transitivamente por
test_repository.py.
"""

import pytest

from catalogos import service as catalogos_service
from usuarios import repository, service
from usuarios.domain import AutodesactivacionError

pytestmark = pytest.mark.django_db


def _rol():
    return catalogos_service.crear_rol("rol-test-usuarios-service")


def _ubicacion():
    return catalogos_service.crear_ubicacion("ubicacion-test-usuarios-service")


# ------------------------------------------------------------------
# crear_usuario
# ------------------------------------------------------------------


def test_crear_usuario_con_rol_inexistente_da_value_error_claro():
    ubicacion = _ubicacion()

    with pytest.raises(ValueError, match="rol"):
        service.crear_usuario(
            "Ana Pérez",
            "ana.perez@uco.edu.co",
            "00000000-0000-0000-0000-000000000000",
            ubicacion.id,
        )


def test_crear_usuario_con_ubicacion_inexistente_da_value_error_claro():
    rol = _rol()

    with pytest.raises(ValueError, match="ubicacion"):
        service.crear_usuario(
            "Ana Pérez",
            "ana.perez@uco.edu.co",
            rol.id,
            "00000000-0000-0000-0000-000000000000",
        )


def test_crear_usuario_con_referencias_validas_delega_al_repository():
    rol = _rol()
    ubicacion = _ubicacion()

    usuario = service.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    assert usuario.rol_id == rol.id
    assert usuario.ubicacion_id == ubicacion.id
    assert usuario.activo is True
    assert usuario.oid_microsoft is None


def test_crear_usuario_normaliza_el_email_a_minusculas():
    rol = _rol()
    ubicacion = _ubicacion()

    usuario = service.crear_usuario("Ana Pérez", "Ana.Perez@UCO.EDU.CO", rol.id, ubicacion.id)

    assert usuario.email_institucional == "ana.perez@uco.edu.co"


# ------------------------------------------------------------------
# obtener_*
# ------------------------------------------------------------------


def test_obtener_usuario_inexistente_devuelve_none():
    assert service.obtener_usuario("00000000-0000-0000-0000-000000000000") is None


def test_obtener_usuario_existente_lo_devuelve():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    assert service.obtener_usuario(creado.id).id == creado.id


def test_obtener_usuario_por_email_inexistente_devuelve_none():
    assert service.obtener_usuario_por_email("no-existe@uco.edu.co") is None


# ------------------------------------------------------------------
# vincular_oid_microsoft
# ------------------------------------------------------------------


def test_vincular_oid_microsoft_con_email_inexistente_da_value_error_claro():
    # El flujo decidido (ver AulaSync backend.md, sección Autenticación):
    # un admin precrea el Usuario antes de que la persona pueda loguearse
    # por primera vez con Office 365. Si no existe, es un error de
    # negocio claro, no un IntegrityError ni un 500.
    with pytest.raises(ValueError, match="email"):
        service.vincular_oid_microsoft("no-existe@uco.edu.co", "oid-123")


def test_vincular_oid_microsoft_con_usuario_precreado_lo_vincula():
    rol = _rol()
    ubicacion = _ubicacion()
    repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    usuario = service.vincular_oid_microsoft("ana.perez@uco.edu.co", "oid-123")

    assert usuario.oid_microsoft == "oid-123"


# ------------------------------------------------------------------
# actualizar_usuario
# ------------------------------------------------------------------


def test_actualizar_usuario_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="usuario"):
        service.actualizar_usuario(
            "00000000-0000-0000-0000-000000000000", nombre="Ana María Pérez"
        )


def test_actualizar_usuario_con_rol_inexistente_da_value_error_claro():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    with pytest.raises(ValueError, match="rol"):
        service.actualizar_usuario(
            creado.id, rol_id="00000000-0000-0000-0000-000000000000"
        )

    # El intento fallido no debe haber tocado el estado persistido.
    assert repository.obtener_usuario_por_id(creado.id).rol_id == rol.id


def test_actualizar_usuario_con_ubicacion_inexistente_da_value_error_claro():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    with pytest.raises(ValueError, match="ubicacion"):
        service.actualizar_usuario(
            creado.id, ubicacion_id="00000000-0000-0000-0000-000000000000"
        )

    assert repository.obtener_usuario_por_id(creado.id).ubicacion_id == ubicacion.id


def test_actualizar_usuario_solo_valida_las_fks_provistas():
    # Un patch que no toca rol_id/ubicacion_id no debe validarlas: el
    # usuario se actualiza sin que la ausencia de esos campos cuente como
    # "referencia inexistente".
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = service.actualizar_usuario(creado.id, nombre="Ana María Pérez")

    assert actualizado.nombre == "Ana María Pérez"
    assert actualizado.rol_id == rol.id
    assert actualizado.ubicacion_id == ubicacion.id


def test_actualizar_usuario_sin_campos_no_cambia_nada():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = service.actualizar_usuario(creado.id)

    assert actualizado.nombre == "Ana Pérez"
    assert actualizado.email_institucional == "ana.perez@uco.edu.co"
    assert actualizado.rol_id == rol.id
    assert actualizado.ubicacion_id == ubicacion.id


def test_actualizar_usuario_con_referencias_validas_delega_al_repository():
    rol = _rol()
    ubicacion = _ubicacion()
    otro_rol = catalogos_service.crear_rol("otro-rol-test-usuarios-service")
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = service.actualizar_usuario(
        creado.id, email_institucional="ana.maria@uco.edu.co", rol_id=otro_rol.id
    )

    assert actualizado.email_institucional == "ana.maria@uco.edu.co"
    assert actualizado.rol_id == otro_rol.id


# ------------------------------------------------------------------
# desactivar_usuario (autoprotección)
# ------------------------------------------------------------------


def test_desactivar_usuario_no_permite_autodesactivarse():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    with pytest.raises(AutodesactivacionError):
        service.desactivar_usuario(creado.id, creado.id)

    # El intento fallido no debe haber tocado el estado persistido.
    assert repository.obtener_usuario_por_id(creado.id).activo is True


def test_desactivar_usuario_permite_que_otro_usuario_lo_desactive():
    rol = _rol()
    ubicacion = _ubicacion()
    objetivo = repository.crear_usuario(
        "Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id
    )
    admin = repository.crear_usuario(
        "Admin Uno", "admin.uno@uco.edu.co", rol.id, ubicacion.id
    )

    actualizado = service.desactivar_usuario(objetivo.id, admin.id)

    assert actualizado.activo is False


def test_desactivar_usuario_inexistente_devuelve_none():
    rol = _rol()
    ubicacion = _ubicacion()
    admin = repository.crear_usuario(
        "Admin Uno", "admin.uno@uco.edu.co", rol.id, ubicacion.id
    )

    assert (
        service.desactivar_usuario("00000000-0000-0000-0000-000000000000", admin.id)
        is None
    )


# ------------------------------------------------------------------
# reactivar_usuario
# ------------------------------------------------------------------


def test_reactivar_usuario_vuelve_a_activarlo():
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario(
        "Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id, activo=False
    )

    actualizado = service.reactivar_usuario(creado.id)

    assert actualizado.activo is True
    assert repository.obtener_usuario_por_id(creado.id).activo is True


def test_reactivar_usuario_ya_activo_es_idempotente():
    # Reactivar a alguien que ya está activo es un no-op que devuelve el
    # usuario, no un error de negocio: el resultado pedido (que quede
    # activo) ya se cumple.
    rol = _rol()
    ubicacion = _ubicacion()
    creado = repository.crear_usuario("Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id)

    actualizado = service.reactivar_usuario(creado.id)

    assert actualizado.activo is True


def test_reactivar_usuario_inexistente_devuelve_none():
    # Mismo contrato que desactivar_usuario/obtener_*: None, no excepción.
    assert service.reactivar_usuario("00000000-0000-0000-0000-000000000000") is None
