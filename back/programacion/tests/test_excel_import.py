"""
Tests de programacion/excel_import.py — parseo/mapeo puro (sin DB) de un
`.xlsx` de programación: reconocimiento de variantes de nombre de columna,
normalización de día/horario/código de semestre. No lleva
`pytest.mark.django_db` (igual criterio que `test_domain.py`): esta capa no
toca la base de datos.
"""

import datetime
import io

import openpyxl
import pytest

from programacion import excel_import


def _workbook_bytes(encabezado, filas):
    workbook = openpyxl.Workbook()
    hoja = workbook.active
    hoja.append(encabezado)
    for fila in filas:
        hoja.append(fila)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# ------------------------------------------------------------------
# leer_filas
# ------------------------------------------------------------------


def test_leer_filas_reconoce_variantes_de_encabezado_y_mapea_a_claves_canonicas():
    archivo = _workbook_bytes(
        ["nroidenti", "Día", "Horario", "Aula", "Materia", "Semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )

    filas = excel_import.leer_filas(archivo)

    assert len(filas) == 1
    numero_fila, fila = filas[0]
    assert numero_fila == 2
    assert fila == {
        "numero_documento": "1000000001",
        "dia": "Lunes",
        "horario": "8:00 A 10:00",
        "aula": "101",
        "materia": "Cálculo I",
        "semestre": 12026,
    }


def test_leer_filas_descarta_filas_completamente_vacias():
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "hora_inicio", "hora_fin", "aula", "materia", "semestre"],
        [
            ["1000000001", "lunes", "08:00", "10:00", "101", "Cálculo I", 12026],
            [None, None, None, None, None, None, None],
        ],
    )

    filas = excel_import.leer_filas(archivo)

    assert len(filas) == 1


def test_leer_filas_sin_columnas_reconocidas_da_value_error():
    archivo = _workbook_bytes(["columna_rara_1", "columna_rara_2"], [["x", "y"]])

    with pytest.raises(ValueError, match="encabezado"):
        excel_import.leer_filas(archivo)


def test_leer_filas_sin_filas_de_datos_da_value_error():
    archivo = _workbook_bytes(["numero_documento", "dia"], [])

    with pytest.raises(ValueError, match="filas de datos"):
        excel_import.leer_filas(archivo)


# ------------------------------------------------------------------
# normalizar_dia
# ------------------------------------------------------------------


def test_normalizar_dia_con_tilde_y_mayusculas():
    assert excel_import.normalizar_dia("Miércoles") == "miercoles"


def test_normalizar_dia_desconocido_da_value_error():
    with pytest.raises(ValueError, match="día"):
        excel_import.normalizar_dia("Lunex")


# ------------------------------------------------------------------
# normalizar_horario
# ------------------------------------------------------------------


def test_normalizar_horario_con_columna_combinada():
    inicio, fin = excel_import.normalizar_horario({"horario": "8:00 A 10:00"})

    assert (inicio, fin) == (datetime.time(8, 0), datetime.time(10, 0))


def test_normalizar_horario_con_columnas_separadas():
    inicio, fin = excel_import.normalizar_horario(
        {"hora_inicio": "08:00:00", "hora_fin": "10:00:00"}
    )

    assert (inicio, fin) == (datetime.time(8, 0), datetime.time(10, 0))


def test_normalizar_horario_con_hora_inicio_mayor_o_igual_a_fin_da_value_error():
    with pytest.raises(ValueError, match="anterior"):
        excel_import.normalizar_horario({"hora_inicio": "10:00", "hora_fin": "08:00"})


def test_normalizar_horario_sin_ninguna_columna_de_hora_da_value_error():
    with pytest.raises(ValueError, match="horario"):
        excel_import.normalizar_horario({"aula": "101"})


# ------------------------------------------------------------------
# normalizar_codigo_semestre
# ------------------------------------------------------------------


def test_normalizar_codigo_semestre_periodo_1():
    assert excel_import.normalizar_codigo_semestre(12026) == "2026-1"


def test_normalizar_codigo_semestre_periodo_2_como_texto():
    assert excel_import.normalizar_codigo_semestre("22026") == "2026-2"


def test_normalizar_codigo_semestre_formato_invalido_da_value_error():
    with pytest.raises(ValueError, match="semestre"):
        excel_import.normalizar_codigo_semestre("2026-1")


def test_normalizar_codigo_semestre_periodo_invalido_da_value_error():
    with pytest.raises(ValueError, match="período"):
        excel_import.normalizar_codigo_semestre(32026)


# ------------------------------------------------------------------
# extraer_fechas_semestre
# ------------------------------------------------------------------


def test_extraer_fechas_semestre_con_columnas_datetime_de_openpyxl():
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre",
         "fecha_inicio", "fecha_fin"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026,
             datetime.datetime(2026, 1, 15), datetime.datetime(2026, 6, 15)],
        ],
    )
    filas = excel_import.leer_filas(archivo)

    resultado = excel_import.extraer_fechas_semestre(filas)

    assert resultado == (datetime.date(2026, 1, 15), datetime.date(2026, 6, 15))


def test_extraer_fechas_semestre_con_variante_fecha_inicio_semestre_como_texto():
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre",
         "fecha_inicio_semestre", "fecha_fin_semestre"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026,
             "2026-01-15", "2026-06-15"],
        ],
    )
    filas = excel_import.leer_filas(archivo)

    resultado = excel_import.extraer_fechas_semestre(filas)

    assert resultado == (datetime.date(2026, 1, 15), datetime.date(2026, 6, 15))


def test_extraer_fechas_semestre_devuelve_none_si_el_archivo_no_trae_columnas_de_fecha():
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )
    filas = excel_import.leer_filas(archivo)

    assert excel_import.extraer_fechas_semestre(filas) is None


def test_extraer_fechas_semestre_con_rangos_distintos_entre_filas_da_value_error():
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre",
         "fecha_inicio", "fecha_fin"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026,
             "2026-01-15", "2026-06-15"],
            ["1000000001", "Martes", "8:00 A 10:00", "101", "Álgebra", 12026,
             "2026-02-01", "2026-06-30"],
        ],
    )
    filas = excel_import.leer_filas(archivo)

    with pytest.raises(ValueError, match="múltiples rangos"):
        excel_import.extraer_fechas_semestre(filas)


def test_extraer_fechas_semestre_con_inicio_no_anterior_a_fin_da_value_error():
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre",
         "fecha_inicio", "fecha_fin"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026,
             "2026-06-15", "2026-01-15"],
        ],
    )
    filas = excel_import.leer_filas(archivo)

    with pytest.raises(ValueError, match="anterior"):
        excel_import.extraer_fechas_semestre(filas)
