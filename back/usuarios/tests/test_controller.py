"""
Tests de usuarios/controller.py — capa HTTP (PATCH y reactivar) del router
de Django Ninja, vía `django.test.Client` contra la instancia real de
`NinjaAPI` montada en `config.urls` (sin mocks), mismo patrón que
`catalogos/tests/test_controller.py` y `configuracion/tests/
test_controller.py` (el precedente de este patrón en el proyecto). El
router de usuarios no tiene `auth=` (ver `config/urls.py`), así que un
`Client()` sin credenciales basta.

Se cubren solo los dos endpoints nuevos (`PATCH /{usuario_id}` y
`POST /{usuario_id}/reactivar`): el resto de la matriz de casos ya está
probada a nivel de `service`/`repository` en `test_service.py`/
`test_repository.py`, y la capa controller es HTTP puro, sin lógica
propia (ver docstring de `controller.py`).

Los fixtures de rol/ubicacion se crean vía `catalogos.service` (la API
pública de ese módulo), nunca vía `catalogos.repository`/`catalogos.model`
— la regla dura de módulos aplica también en los tests.
"""

import json

import pytest
from django.test import Client

from catalogos import service as catalogos_service
from usuarios import repository

pytestmark = pytest.mark.django_db


def _rol():
    return catalogos_service.crear_rol("rol-test-usuarios-controller")


def _ubicacion():
    return catalogos_service.crear_ubicacion("ubicacion-test-usuarios-controller")


def _usuario(activo: bool = True):
    rol = _rol()
    ubicacion = _ubicacion()
    return repository.crear_usuario(
        "Ana Pérez", "ana.perez@uco.edu.co", rol.id, ubicacion.id, activo=activo
    )


# ------------------------------------------------------------------
# PATCH /{usuario_id}
# ------------------------------------------------------------------


def test_patch_usuario_actualiza_solo_los_campos_provistos():
    usuario = _usuario()
    client = Client()

    response = client.patch(
        f"/api/usuarios/{usuario.id}",
        data=json.dumps({"nombre": "Ana María Pérez"}),
        content_type="application/json",
    )

    assert response.status_code == 200
    cuerpo = response.json()
    assert cuerpo["nombre"] == "Ana María Pérez"
    assert cuerpo["email_institucional"] == "ana.perez@uco.edu.co"


def test_patch_usuario_actualiza_rol_y_ubicacion():
    usuario = _usuario()
    # Rol.nombre es varchar(30) en el DDL: el nombre del fixture se
    # mantiene corto a propósito.
    otro_rol = catalogos_service.crear_rol("otro-rol-usuarios-ctrl")
    otra_ubicacion = catalogos_service.crear_ubicacion(
        "otra-ubicacion-test-usuarios-controller"
    )
    client = Client()

    response = client.patch(
        f"/api/usuarios/{usuario.id}",
        data=json.dumps(
            {"rol_id": str(otro_rol.id), "ubicacion_id": str(otra_ubicacion.id)}
        ),
        content_type="application/json",
    )

    assert response.status_code == 200
    cuerpo = response.json()
    assert cuerpo["rol_id"] == str(otro_rol.id)
    assert cuerpo["ubicacion_id"] == str(otra_ubicacion.id)


def test_patch_usuario_inexistente_devuelve_404():
    client = Client()

    response = client.patch(
        "/api/usuarios/00000000-0000-0000-0000-000000000000",
        data=json.dumps({"nombre": "Ana María Pérez"}),
        content_type="application/json",
    )

    assert response.status_code == 404


def test_patch_usuario_con_rol_inexistente_devuelve_400():
    usuario = _usuario()
    client = Client()

    response = client.patch(
        f"/api/usuarios/{usuario.id}",
        data=json.dumps({"rol_id": "00000000-0000-0000-0000-000000000000"}),
        content_type="application/json",
    )

    assert response.status_code == 400


def test_patch_usuario_con_ubicacion_inexistente_devuelve_400():
    usuario = _usuario()
    client = Client()

    response = client.patch(
        f"/api/usuarios/{usuario.id}",
        data=json.dumps({"ubicacion_id": "00000000-0000-0000-0000-000000000000"}),
        content_type="application/json",
    )

    assert response.status_code == 400


def test_patch_usuario_no_permite_modificar_activo():
    # `activo` no está declarado en UsuarioPatch a propósito (ver docstring
    # del schema): activación y desactivación tienen endpoints propios con
    # reglas propias. Ninja descarta los campos no declarados, así que el
    # PATCH pasa pero el estado persistido de `activo` no cambia.
    usuario = _usuario(activo=False)
    client = Client()

    response = client.patch(
        f"/api/usuarios/{usuario.id}",
        data=json.dumps({"nombre": "Ana María Pérez", "activo": True}),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["activo"] is False
    assert repository.obtener_usuario_por_id(usuario.id).activo is False


# ------------------------------------------------------------------
# POST /{usuario_id}/reactivar
# ------------------------------------------------------------------


def test_post_reactivar_usuario_lo_vuelve_a_activar():
    usuario = _usuario(activo=False)
    client = Client()

    response = client.post(f"/api/usuarios/{usuario.id}/reactivar")

    assert response.status_code == 200
    assert response.json()["activo"] is True
    assert repository.obtener_usuario_por_id(usuario.id).activo is True


def test_post_reactivar_usuario_ya_activo_devuelve_200():
    usuario = _usuario()
    client = Client()

    response = client.post(f"/api/usuarios/{usuario.id}/reactivar")

    assert response.status_code == 200
    assert response.json()["activo"] is True


def test_post_reactivar_usuario_inexistente_devuelve_404():
    client = Client()

    response = client.post(
        "/api/usuarios/00000000-0000-0000-0000-000000000000/reactivar"
    )

    assert response.status_code == 404
