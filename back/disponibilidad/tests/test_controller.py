"""
Tests de disponibilidad/controller.py — capa HTTP del router de Django
Ninja, vía `django.test.Client` contra la instancia real de `NinjaAPI`
montada en `config.urls` (sin mocks), mismo patrón que
`reservas/tests/test_controller.py`. El router de disponibilidad no tiene
`auth=` (ver `config/urls.py`), así que un `Client()` sin credenciales
basta.

Solo se cubre el contrato HTTP (200 con la estructura combinada, 400 con
`detail` ante `ValueError`) — la matriz completa de reglas de combinación
de las 3 fuentes ya está probada exhaustivamente a nivel de service en
`test_service.py`; repetirla acá sería redundante (el controller es HTTP
puro, sin lógica propia, ver docstring de `controller.py`).
"""

import datetime

import pytest
from django.test import Client

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import service as programacion_service
from programacion.model import DiaSemana

pytestmark = pytest.mark.django_db


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _docente(numero_documento="1000000001", nombre="Docente Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _semestre(codigo="2026-1"):
    return programacion_service.crear_semestre(
        codigo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )


def test_get_disponibilidad_salon_sin_filtros_devuelve_200_con_estructura_combinada():
    salon = _salon()
    semestre = _semestre()
    docente = _docente()
    programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    response = Client().get(f"/api/disponibilidad/salon/{salon.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["salon_id"] == str(salon.id)
    assert len(data["ocupaciones"]) == 1
    assert data["ocupaciones"][0]["origen"] == "programacion"
    assert data["ocupaciones"][0]["titulo"] == "Cálculo I"


def test_get_disponibilidad_salon_con_query_dia_filtra_por_ese_dia():
    salon = _salon()
    semestre = _semestre()
    docente = _docente()
    programacion_service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.MARTES,
        datetime.time(8, 0), datetime.time(10, 0), "Física I",
    )

    response = Client().get(f"/api/disponibilidad/salon/{salon.id}?dia=lunes")

    assert response.status_code == 200
    assert response.json()["ocupaciones"] == []


def test_get_disponibilidad_salon_con_query_fecha_devuelve_dia_resuelto():
    salon = _salon()

    response = Client().get(f"/api/disponibilidad/salon/{salon.id}?fecha=2026-03-09")

    assert response.status_code == 200
    data = response.json()
    assert data["dia"] == "lunes"
    assert data["fecha"] == "2026-03-09"


def test_get_disponibilidad_salon_inexistente_devuelve_400_con_detail():
    response = Client().get(
        "/api/disponibilidad/salon/00000000-0000-0000-0000-000000000000"
    )

    assert response.status_code == 400
    assert "salon" in response.json()["detail"]


def test_get_disponibilidad_salon_con_dia_y_fecha_inconsistentes_devuelve_400():
    salon = _salon()

    response = Client().get(
        f"/api/disponibilidad/salon/{salon.id}?dia=martes&fecha=2026-03-09"
    )

    assert response.status_code == 400
    assert "dia" in response.json()["detail"]
