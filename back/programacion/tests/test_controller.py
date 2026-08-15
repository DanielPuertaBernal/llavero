"""
Tests de programacion/controller.py — capa HTTP del router de Django
Ninja, vía `django.test.Client` contra la instancia real de `NinjaAPI`
montada en `config.urls` (sin mocks), mismo patrón que
`catalogos/tests/test_controller.py`. El router de programacion no tiene
`auth=` (ver `config/urls.py`), así que un `Client()` sin credenciales
basta.

Se cubre acá específicamente `POST /programacion/importar` (carga masiva
desde Excel, multipart): el resto de endpoints de este controller
(`crear_semestre`/`crear_programacion`/etc.) son HTTP puro de un solo
passthrough y ya quedan cubiertos transitivamente por `test_service.py`.
"""

import datetime
import io

import openpyxl
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service

pytestmark = pytest.mark.django_db


def _workbook_bytes(encabezado, filas):
    workbook = openpyxl.Workbook()
    hoja = workbook.active
    hoja.append(encabezado)
    for fila in filas:
        hoja.append(fila)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _salon(nombre="101"):
    bloque = catalogos_service.crear_bloque(f"Bloque-controller-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-controller-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _docente(numero_documento="1000000001"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-controller-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, "Docente Prueba", tipo_persona.id)


def _archivo_upload(contenido: bytes, nombre="programacion.xlsx"):
    return SimpleUploadedFile(
        nombre,
        contenido,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def test_post_importar_camino_feliz_devuelve_200_con_resumen():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )
    client = Client()

    response = client.post(
        "/api/programacion/importar",
        data={
            "archivo": _archivo_upload(archivo),
            "semestre_fecha_inicio": "2026-01-15",
            "semestre_fecha_fin": "2026-06-15",
        },
    )

    assert response.status_code == 200
    cuerpo = response.json()
    assert cuerpo["creadas"] == 1
    assert cuerpo["omitidas"] == []
    assert cuerpo["semestre"]["codigo"] == "2026-1"


def test_post_importar_con_fila_de_aula_desconocida_no_aborta_devuelve_200_con_omitida():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "AULA-FANTASMA", "Cálculo I", 12026],
            ["1000000001", "Martes", "8:00 A 10:00", "101", "Álgebra", 12026],
        ],
    )
    client = Client()

    response = client.post(
        "/api/programacion/importar",
        data={
            "archivo": _archivo_upload(archivo),
            "semestre_fecha_inicio": "2026-01-15",
            "semestre_fecha_fin": "2026-06-15",
        },
    )

    assert response.status_code == 200
    cuerpo = response.json()
    assert cuerpo["creadas"] == 1
    assert len(cuerpo["omitidas"]) == 1


def test_post_importar_archivo_sin_columnas_reconocidas_devuelve_400():
    archivo = _workbook_bytes(["columna_rara"], [["x"]])
    client = Client()

    response = client.post(
        "/api/programacion/importar",
        data={
            "archivo": _archivo_upload(archivo),
            "semestre_fecha_inicio": "2026-01-15",
            "semestre_fecha_fin": "2026-06-15",
        },
    )

    assert response.status_code == 400


def test_post_importar_sin_fechas_de_form_usa_las_del_excel():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre",
         "fecha_inicio", "fecha_fin"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026,
             "2026-01-15", "2026-06-15"],
        ],
    )
    client = Client()

    response = client.post(
        "/api/programacion/importar",
        data={"archivo": _archivo_upload(archivo)},
    )

    assert response.status_code == 200
    cuerpo = response.json()
    assert cuerpo["creadas"] == 1
    assert cuerpo["semestre"]["fecha_inicio"] == "2026-01-15"
    assert cuerpo["semestre"]["fecha_fin"] == "2026-06-15"


def test_post_importar_sin_fechas_de_form_ni_en_excel_devuelve_400():
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )
    client = Client()

    response = client.post(
        "/api/programacion/importar",
        data={"archivo": _archivo_upload(archivo)},
    )

    assert response.status_code == 400


def test_post_importar_con_docente_desconocido_devuelve_200_creada_sin_docente():
    _salon("101")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["9999999999", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )
    client = Client()

    response = client.post(
        "/api/programacion/importar",
        data={
            "archivo": _archivo_upload(archivo),
            "semestre_fecha_inicio": "2026-01-15",
            "semestre_fecha_fin": "2026-06-15",
        },
    )

    assert response.status_code == 200
    cuerpo = response.json()
    assert cuerpo["creadas"] == 1
    assert cuerpo["creadas_sin_docente"] == 1
    assert cuerpo["omitidas"] == []


def test_reimportar_el_mismo_archivo_por_http_es_seguro_no_da_500():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )
    client = Client()
    payload = lambda: {
        "archivo": _archivo_upload(archivo),
        "semestre_fecha_inicio": "2026-01-15",
        "semestre_fecha_fin": "2026-06-15",
    }

    primera = client.post("/api/programacion/importar", data=payload())
    segunda = client.post("/api/programacion/importar", data=payload())

    assert primera.status_code == 200
    assert segunda.status_code == 200
    assert segunda.json()["creadas"] == 0
    assert len(segunda.json()["omitidas"]) == 1
