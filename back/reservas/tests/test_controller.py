"""
Tests de reservas/controller.py — capa HTTP del router de Django Ninja,
vía `django.test.Client` contra la instancia real de `NinjaAPI` montada en
`config.urls` (sin mocks), mismo patrón que `catalogos/tests/
test_controller.py`/`configuracion/tests/test_controller.py`. El router de
reservas no tiene `auth=` (ver `config/urls.py`), así que un `Client()` sin
credenciales basta.

Se cubre el POST de creación, y dentro de él solo el contrato que la capa
HTTP aporta de verdad: que un `ValueError` del service salga como 400 con
`detail`, y que el camino feliz salga como 201. La matriz completa de
reglas de negocio (referencias inexistentes, franja horaria inválida,
solapamiento, transiciones de estado) ya está probada exhaustivamente a
nivel de service en `test_service.py`; repetirla acá sería redundante — el
controller es HTTP puro, sin lógica propia (ver docstring de
`controller.py`).

Se prueba puntualmente la franja horaria inválida porque es justo el caso
que ANTES escapaba al service y llegaba a la base de datos como
`IntegrityError` del CHECK `ck_reserva_individual_horario_valido`: un 500
sin `detail`, en vez del 400 que el controller ya sabía producir para todas
las demás reglas.
"""

import datetime
import json

import pytest
from django.test import Client

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _solicitante(numero_documento="1000000001", nombre="Solicitante Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _payload(salon, solicitante, hora_inicio, hora_fin):
    return {
        "salon_id": str(salon.id),
        "solicitante_id": str(solicitante.id),
        "fecha": "2026-03-10",
        "hora_inicio": hora_inicio,
        "hora_fin": hora_fin,
    }


def _post(payload):
    return Client().post(
        "/api/reservas/",
        data=json.dumps(payload),
        content_type="application/json",
    )


def test_post_reserva_con_franja_valida_devuelve_201():
    salon = _salon()
    solicitante = _solicitante()

    response = _post(_payload(salon, solicitante, "08:00:00", "10:00:00"))

    assert response.status_code == 201
    assert response.json()["hora_inicio"] == "08:00:00"


def test_post_reserva_con_hora_inicio_posterior_a_hora_fin_devuelve_400_con_detail():
    salon = _salon()
    solicitante = _solicitante()

    response = _post(_payload(salon, solicitante, "10:00:00", "08:00:00"))

    assert response.status_code == 400
    assert "anterior" in response.json()["detail"]


def test_post_reserva_con_hora_inicio_igual_a_hora_fin_devuelve_400_con_detail():
    salon = _salon()
    solicitante = _solicitante()

    response = _post(_payload(salon, solicitante, "08:00:00", "08:00:00"))

    assert response.status_code == 400
    assert "anterior" in response.json()["detail"]


def test_post_reserva_con_solapamiento_devuelve_400_con_detail():
    salon = _salon()
    solicitante = _solicitante()
    assert _post(_payload(salon, solicitante, "08:00:00", "10:00:00")).status_code == 201

    response = _post(_payload(salon, solicitante, "09:00:00", "11:00:00"))

    assert response.status_code == 400
    assert "solapa" in response.json()["detail"]


def test_get_reservas_por_estado_solo_devuelve_ese_estado():
    salon = _salon()
    solicitante = _solicitante()
    aprobada = _post(_payload(salon, solicitante, "08:00:00", "10:00:00")).json()

    response = Client().get("/api/reservas/estado/aprobada")

    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert aprobada["id"] in ids
    for reserva in response.json():
        assert reserva["estado"] == "aprobada"
