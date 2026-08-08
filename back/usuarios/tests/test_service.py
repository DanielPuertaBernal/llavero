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
