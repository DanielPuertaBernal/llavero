"""
Tests de historial/controller.py — capa HTTP del router de Django Ninja,
vía `django.test.Client` contra la instancia real de `NinjaAPI` montada
en `config.urls` (sin mocks), mismo patrón que
`disponibilidad/tests/test_controller.py`. El router de historial no
tiene `auth=` (ver `config/urls.py`) — este backend todavía no protege
por autenticación/rol ningún router (ver `auth/controller.py`) — así que
un `Client()` sin credenciales basta.

Solo se cubre el contrato HTTP (200 con la lista combinada, con/sin el
query param `usuario_id`) — la matriz completa de reglas de combinación
de las 2 fuentes ya está probada exhaustivamente a nivel de service en
`test_service.py`; repetirla acá sería redundante (el controller es HTTP
puro, sin lógica propia, ver docstring de `controller.py`).
"""

import uuid

import pytest
from django.test import Client

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from llaves import service as llaves_service
from llaves.model import OrigenLlave, TipoEntregaLlave
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


def _persona(numero_documento="1000000001", nombre="Persona Prueba"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, nombre, tipo_persona.id)


def _salon(nombre=None):
    # Nombre único por llamada (uuid corto): este fixture se usa varias
    # veces por test (una llave por usuario) y `nombre` es UNIQUE en
    # `salon` (ver catalogos.model) — un default fijo tipo "101" chocaría
    # en la segunda llamada dentro del mismo test.
    nombre = nombre or uuid.uuid4().hex[:8]
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _ubicacion(nombre=None):
    nombre = nombre or f"ubicacion-{uuid.uuid4().hex[:8]}"
    return catalogos_service.crear_ubicacion(
        nombre, permite_prestamo_llaves=True, permite_devolucion_llaves=True
    )


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-usuario-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


def _crear_llave(usuario_entrega):
    salon = _salon()
    sufijo = uuid.uuid4().hex[:8]
    docente_titular = _persona(f"1{sufijo[:9]}", "Docente Titular")
    reclamado_por = _persona(f"2{sufijo[:9]}", "Reclamado Por")
    ubicacion = _ubicacion()
    return llaves_service.crear_llave(
        salon.id,
        docente_titular.id,
        reclamado_por.id,
        OrigenLlave.MANUAL,
        TipoEntregaLlave.CREDENCIAL,
        usuario_entrega.id,
        ubicacion.id,
    )


def test_get_historial_sin_filtro_devuelve_200_con_todos_los_eventos():
    usuario = _usuario("portero@uco.edu.co", "Portero")
    llave = _crear_llave(usuario)

    response = Client().get("/api/historial/")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["tipo_recurso"] == "llave"
    assert data[0]["tipo_evento"] == "entrega"
    assert data[0]["llave_id"] == str(llave.id)
    assert data[0]["procesado_por_id"] == str(usuario.id)


def test_get_historial_con_query_usuario_id_filtra_solo_lo_de_ese_usuario():
    ana = _usuario("ana2@uco.edu.co", "Ana")
    luis = _usuario("luis2@uco.edu.co", "Luis")
    _crear_llave(ana)
    _crear_llave(luis)

    response = Client().get(f"/api/historial/?usuario_id={ana.id}")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["procesado_por_id"] == str(ana.id)


def test_get_historial_sin_ningun_evento_devuelve_200_con_lista_vacia():
    response = Client().get("/api/historial/")

    assert response.status_code == 200
    assert response.json() == []
