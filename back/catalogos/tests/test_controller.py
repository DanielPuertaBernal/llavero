"""
Tests de catalogos/controller.py — capa HTTP (PATCH/DELETE) del router de
Django Ninja, vía `django.test.Client` contra la instancia real de
`NinjaAPI` montada en `config.urls` (sin mocks), mismo patrón que
`configuracion/tests/test_controller.py` (el precedente de este patrón en
el proyecto). El router de catalogos no tiene `auth=` (ver `config/
urls.py`), así que un `Client()` sin credenciales basta.

Se cubren dos entidades a nivel de controller (no las 6): `Bloque`
(PATCH/DELETE simples, un solo campo) y `Salon` (PATCH con validación de
FK y DELETE protegido) — el resto de la matriz de casos (ValueError por
id inexistente, ValueError por ProtectedError, partial update) ya está
probada exhaustivamente a nivel de `service`/`repository` en
`test_service.py`/`test_repository.py` para las 6 entidades; repetir esos
mismos casos para las 4 entidades restantes a nivel de Client() sería
redundante (la capa controller es HTTP puro, sin lógica propia — ver
docstring de `controller.py`).
"""

import json

import pytest
from django.test import Client

from catalogos import repository

pytestmark = pytest.mark.django_db


# ------------------------------------------------------------------
# Bloque
# ------------------------------------------------------------------


def test_patch_bloque_actualiza_nombre():
    bloque = repository.crear_bloque("Bloque controller patch")
    client = Client()

    response = client.patch(
        f"/api/catalogos/bloques/{bloque.id}",
        data=json.dumps({"nombre": "Bloque renombrado"}),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["nombre"] == "Bloque renombrado"


def test_patch_bloque_inexistente_devuelve_404():
    client = Client()

    response = client.patch(
        "/api/catalogos/bloques/00000000-0000-0000-0000-000000000000",
        data=json.dumps({"nombre": "x"}),
        content_type="application/json",
    )

    assert response.status_code == 404


def test_delete_bloque_devuelve_204_y_lo_elimina():
    bloque = repository.crear_bloque("Bloque controller delete")
    client = Client()

    response = client.delete(f"/api/catalogos/bloques/{bloque.id}")

    assert response.status_code == 204
    assert repository.obtener_bloque_por_id(bloque.id) is None


def test_delete_bloque_inexistente_devuelve_404():
    client = Client()

    response = client.delete(
        "/api/catalogos/bloques/00000000-0000-0000-0000-000000000000"
    )

    assert response.status_code == 404


def test_delete_bloque_referenciado_por_salon_devuelve_400():
    bloque = repository.crear_bloque("Bloque controller protegido")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo controller protegido")
    repository.crear_salon("101", bloque.id, tipo_silleteria.id)
    client = Client()

    response = client.delete(f"/api/catalogos/bloques/{bloque.id}")

    assert response.status_code == 400


# ------------------------------------------------------------------
# Salon
# ------------------------------------------------------------------


def test_patch_salon_actualiza_solo_los_campos_provistos():
    bloque = repository.crear_bloque("Bloque salon controller")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo salon controller")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)
    client = Client()

    response = client.patch(
        f"/api/catalogos/salones/{salon.id}",
        data=json.dumps({"cantidad_sillas": 40}),
        content_type="application/json",
    )

    assert response.status_code == 200
    cuerpo = response.json()
    assert cuerpo["cantidad_sillas"] == 40
    assert cuerpo["nombre"] == "101"


def test_patch_salon_con_bloque_inexistente_devuelve_400():
    bloque = repository.crear_bloque("Bloque salon controller 2")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo salon controller 2")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)
    client = Client()

    response = client.patch(
        f"/api/catalogos/salones/{salon.id}",
        data=json.dumps({"bloque_id": "00000000-0000-0000-0000-000000000000"}),
        content_type="application/json",
    )

    assert response.status_code == 400


def test_patch_salon_inexistente_devuelve_404():
    client = Client()

    response = client.patch(
        "/api/catalogos/salones/00000000-0000-0000-0000-000000000000",
        data=json.dumps({"nombre": "x"}),
        content_type="application/json",
    )

    assert response.status_code == 404


def test_delete_salon_devuelve_204_y_lo_elimina():
    bloque = repository.crear_bloque("Bloque salon delete controller")
    tipo_silleteria = repository.crear_tipo_silleteria("Tipo salon delete controller")
    salon = repository.crear_salon("101", bloque.id, tipo_silleteria.id)
    client = Client()

    response = client.delete(f"/api/catalogos/salones/{salon.id}")

    assert response.status_code == 204
    assert repository.obtener_salon_por_id(salon.id) is None


def test_delete_salon_inexistente_devuelve_404():
    client = Client()

    response = client.delete(
        "/api/catalogos/salones/00000000-0000-0000-0000-000000000000"
    )

    assert response.status_code == 404


# ------------------------------------------------------------------
# Unicidad — un choque de unicidad tiene que llegar al cliente como 400
# con {detail} legible, nunca como el 500 sin cuerpo que producía el
# IntegrityError crudo (ver docstring de `service.py`).
# ------------------------------------------------------------------


def test_post_rol_con_nombre_duplicado_devuelve_400_con_detail():
    repository.crear_rol("rol-http-dup")
    client = Client()

    response = client.post(
        "/api/catalogos/roles",
        data=json.dumps({"nombre": "rol-http-dup"}),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert "rol-http-dup" in response.json()["detail"]


def test_post_bloque_con_nombre_duplicado_devuelve_400():
    repository.crear_bloque("Bloque http dup")
    client = Client()

    response = client.post(
        "/api/catalogos/bloques",
        data=json.dumps({"nombre": "Bloque http dup"}),
        content_type="application/json",
    )

    assert response.status_code == 400


def test_patch_bloque_con_nombre_de_otro_bloque_devuelve_400():
    repository.crear_bloque("Bloque http ocupado")
    bloque = repository.crear_bloque("Bloque http a renombrar")
    client = Client()

    response = client.patch(
        f"/api/catalogos/bloques/{bloque.id}",
        data=json.dumps({"nombre": "Bloque http ocupado"}),
        content_type="application/json",
    )

    assert response.status_code == 400


def test_post_salon_duplicado_en_el_mismo_bloque_devuelve_400():
    bloque = repository.crear_bloque("Bloque http salon dup")
    tipo_silleteria = repository.crear_tipo_silleteria("silleteria-http-dup")
    repository.crear_salon("101", bloque.id, tipo_silleteria.id)
    client = Client()

    response = client.post(
        "/api/catalogos/salones",
        data=json.dumps(
            {
                "nombre": "101",
                "bloque_id": str(bloque.id),
                "tipo_silleteria_id": str(tipo_silleteria.id),
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 400
