"""
Tests de programacion/service.py — la lógica que agrega valor sobre el
repository: validación de FKs cross-módulo (salon_id vía
catalogos.service, docente_id vía comunidad.service, semestre_id contra
este mismo módulo) y, sobre todo, la validación de solapamiento de
horarios (ver docstring de service.py y domain.hay_solapamiento) — la
pieza central que este módulo aporta para resolver la deuda técnica de
lógica de solapamiento triplicada del sistema legacy. Los passthrough
directos ya están cubiertos transitivamente por test_repository.py.
"""

import datetime
import io

import openpyxl
import pytest

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from programacion import repository, service
from programacion.model import DiaSemana
from reservas import service as reservas_service

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
    bloque = catalogos_service.crear_bloque(f"Bloque-{nombre}")
    tipo_silleteria = catalogos_service.crear_tipo_silleteria(f"Silla-{nombre}")
    return catalogos_service.crear_salon(nombre, bloque.id, tipo_silleteria.id)


def _docente(numero_documento="1000000001"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(numero_documento, "Docente Prueba", tipo_persona.id)


def _semestre(codigo="2026-1"):
    return repository.crear_semestre(
        codigo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )


# ------------------------------------------------------------------
# Semestre
# ------------------------------------------------------------------


def test_crear_semestre_delega_al_repository():
    semestre = service.crear_semestre(
        "2026-1", datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert semestre.codigo == "2026-1"


def test_obtener_semestre_inexistente_devuelve_none():
    assert service.obtener_semestre("00000000-0000-0000-0000-000000000000") is None


def test_obtener_semestre_existente_lo_devuelve():
    creado = _semestre()

    assert service.obtener_semestre(creado.id).id == creado.id


# ------------------------------------------------------------------
# crear_programacion — validación de referencias
# ------------------------------------------------------------------


def test_crear_programacion_con_salon_inexistente_da_value_error_claro():
    docente = _docente()
    semestre = _semestre()

    with pytest.raises(ValueError, match="salon"):
        service.crear_programacion(
            "00000000-0000-0000-0000-000000000000",
            docente.id,
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )


def test_crear_programacion_con_docente_inexistente_da_value_error_claro():
    salon = _salon()
    semestre = _semestre()

    with pytest.raises(ValueError, match="docente"):
        service.crear_programacion(
            salon.id,
            "00000000-0000-0000-0000-000000000000",
            semestre.id,
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )


def test_crear_programacion_con_semestre_inexistente_da_value_error_claro():
    salon = _salon()
    docente = _docente()

    with pytest.raises(ValueError, match="semestre"):
        service.crear_programacion(
            salon.id,
            docente.id,
            "00000000-0000-0000-0000-000000000000",
            DiaSemana.LUNES,
            datetime.time(8, 0),
            datetime.time(10, 0),
            "Cálculo I",
        )


def test_crear_programacion_sin_docente_id_crea_con_docente_none():
    salon = _salon()
    semestre = _semestre()

    programacion = service.crear_programacion(
        salon.id,
        None,
        semestre.id,
        DiaSemana.LUNES,
        datetime.time(8, 0),
        datetime.time(10, 0),
        "Cálculo I",
    )

    assert programacion.docente_id is None
    assert programacion.salon_id == salon.id
    assert programacion.semestre_id == semestre.id


def test_crear_programacion_sin_docente_id_igual_valida_solapamiento():
    salon = _salon()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, None, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_programacion(
            salon.id, None, semestre.id, DiaSemana.LUNES,
            datetime.time(9, 0), datetime.time(11, 0), "Álgebra",
        )


def test_crear_programacion_con_referencias_validas_delega_al_repository():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()

    programacion = service.crear_programacion(
        salon.id,
        docente.id,
        semestre.id,
        DiaSemana.LUNES,
        datetime.time(8, 0),
        datetime.time(10, 0),
        "Cálculo I",
    )

    assert programacion.salon_id == salon.id
    assert programacion.docente_id == docente.id
    assert programacion.semestre_id == semestre.id


# ------------------------------------------------------------------
# crear_programacion — validación de solapamiento
# ------------------------------------------------------------------


def test_crear_programacion_con_solapamiento_en_mismo_salon_y_dia_da_value_error_claro():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_programacion(
            salon.id, docente.id, semestre.id, DiaSemana.LUNES,
            datetime.time(9, 0), datetime.time(11, 0), "Álgebra",
        )


def test_crear_programacion_con_horas_adyacentes_no_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    # No debe lanzar: 10:00 es el fin de la primera y el inicio de la
    # segunda, franjas adyacentes que no se solapan (ver domain.py).
    segunda = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(10, 0), datetime.time(12, 0), "Álgebra",
    )

    assert segunda.materia == "Álgebra"


def test_crear_programacion_mismo_salon_distinto_dia_no_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    martes = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.MARTES,
        datetime.time(8, 0), datetime.time(10, 0), "Álgebra",
    )

    assert martes.dia == DiaSemana.MARTES


def test_crear_programacion_mismas_horas_en_otro_salon_no_da_value_error():
    salon_1 = _salon("101")
    salon_2 = _salon("102")
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon_1.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    en_otro_salon = service.crear_programacion(
        salon_2.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Álgebra",
    )

    assert en_otro_salon.salon_id == salon_2.id


# ------------------------------------------------------------------
# crear_programacion — validación cruzada RF15: contra ReservaIndividual
# ya aprobada (fuente puntual, ver docstring de service.crear_programacion
# y programacion.domain.dia_semana_de_fecha).
# ------------------------------------------------------------------


def test_crear_programacion_con_solapamiento_contra_reserva_individual_aprobada_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    # Lunes 9 de marzo de 2026 cae dentro del semestre (2026-01-15 a
    # 2026-06-15) y es un lunes real (ver DIAS_SEMANA/dia_semana_de_fecha).
    reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(9, 0), datetime.time(11, 0),
    )

    with pytest.raises(ValueError, match="solapa"):
        service.crear_programacion(
            salon.id, docente.id, semestre.id, DiaSemana.LUNES,
            datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
        )


def test_crear_programacion_sin_choque_contra_reserva_individual_no_da_value_error():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(10, 0), datetime.time(12, 0),
    )

    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert creada.materia == "Cálculo I"


def test_crear_programacion_no_choca_con_reserva_individual_cancelada():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    reserva = reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 3, 9),
        datetime.time(8, 0), datetime.time(10, 0),
    )
    reservas_service.cancelar_reserva(reserva.id)

    # No debe lanzar: la reserva individual está cancelada, no bloquea.
    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert creada.materia == "Cálculo I"


def test_crear_programacion_no_choca_con_reserva_individual_fuera_del_semestre():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    solicitante = comunidad_service.crear_persona(
        "1000000099", "Solicitante Prueba", catalogos_service.crear_tipo_persona("tipo-sol").id
    )
    # Lunes 6 de julio de 2026, fuera del rango del semestre (termina el
    # 2026-06-15): no debe considerarse para la validación cruzada.
    reservas_service.crear_reserva(
        salon.id, solicitante.id, datetime.date(2026, 7, 6),
        datetime.time(8, 0), datetime.time(10, 0),
    )

    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert creada.materia == "Cálculo I"


# ------------------------------------------------------------------
# existe_solapamiento_en_salon — pieza reutilizable
# ------------------------------------------------------------------


def test_existe_solapamiento_en_salon_true_cuando_choca():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert service.existe_solapamiento_en_salon(
        salon.id, DiaSemana.LUNES, datetime.time(9, 0), datetime.time(11, 0)
    ) is True


def test_existe_solapamiento_en_salon_false_cuando_no_hay_nada_programado():
    salon = _salon()

    assert service.existe_solapamiento_en_salon(
        salon.id, DiaSemana.LUNES, datetime.time(9, 0), datetime.time(11, 0)
    ) is False


# ------------------------------------------------------------------
# listar / obtener
# ------------------------------------------------------------------


def test_obtener_programacion_inexistente_devuelve_none():
    assert service.obtener_programacion("00000000-0000-0000-0000-000000000000") is None


def test_obtener_programacion_existente_la_devuelve():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    creada = service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    assert service.obtener_programacion(creada.id).id == creada.id


def test_listar_programaciones_por_salon_y_dia_delega_al_repository():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    resultado = service.listar_programaciones_por_salon_y_dia(salon.id, DiaSemana.LUNES)

    assert [p.materia for p in resultado] == ["Cálculo I"]


def test_listar_programaciones_por_docente_delega_al_repository():
    salon = _salon()
    docente = _docente()
    semestre = _semestre()
    service.crear_programacion(
        salon.id, docente.id, semestre.id, DiaSemana.LUNES,
        datetime.time(8, 0), datetime.time(10, 0), "Cálculo I",
    )

    resultado = service.listar_programaciones_por_docente(docente.id)

    assert [p.materia for p in resultado] == ["Cálculo I"]


# ------------------------------------------------------------------
# obtener_o_crear_semestre
# ------------------------------------------------------------------


def test_obtener_o_crear_semestre_crea_si_no_existe():
    semestre = service.obtener_o_crear_semestre(
        "2026-1", datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert semestre.codigo == "2026-1"


def test_obtener_o_crear_semestre_reutiliza_el_existente_sin_pisar_fechas():
    original = _semestre("2026-1")

    reutilizado = service.obtener_o_crear_semestre(
        "2026-1", datetime.date(2099, 1, 1), datetime.date(2099, 6, 1)
    )

    assert reutilizado.id == original.id
    assert reutilizado.fecha_inicio == original.fecha_inicio
    assert reutilizado.fecha_fin == original.fecha_fin


# ------------------------------------------------------------------
# importar_programacion_desde_excel — carga masiva desde Excel (RF "cargar
# programación desde Excel"). Referencia de negocio: AulaSync
# programacion.service.js#importarDesdeExcel (sin copiar su código, ver
# docstring de programacion/excel_import.py).
# ------------------------------------------------------------------


def test_importar_excel_camino_feliz_crea_programaciones_y_semestre():
    salon = _salon("101")
    docente = _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026],
            ["1000000001", "Martes", "8:00 A 10:00", "101", "Álgebra", 12026],
        ],
    )

    resultado = service.importar_programacion_desde_excel(
        archivo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert resultado["creadas"] == 2
    assert resultado["creadas_sin_docente"] == 0
    assert resultado["omitidas"] == []
    assert resultado["semestre"].codigo == "2026-1"
    creadas = service.listar_programaciones_por_docente(docente.id)
    assert {p.materia for p in creadas} == {"Cálculo I", "Álgebra"}
    assert all(p.salon_id == salon.id for p in creadas)


def test_importar_excel_con_aula_desconocida_omite_la_fila_y_sigue_con_las_demas():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [
            ["1000000001", "Lunes", "8:00 A 10:00", "AULA-FANTASMA", "Cálculo I", 12026],
            ["1000000001", "Martes", "8:00 A 10:00", "101", "Álgebra", 12026],
        ],
    )

    resultado = service.importar_programacion_desde_excel(
        archivo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert resultado["creadas"] == 1
    assert len(resultado["omitidas"]) == 1
    assert resultado["omitidas"][0]["fila"] == 2
    assert "aula" in resultado["omitidas"][0]["motivo"]


def test_importar_excel_con_docente_desconocido_se_importa_sin_docente_no_se_omite():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [
            ["9999999999", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026],
            ["1000000001", "Martes", "8:00 A 10:00", "101", "Álgebra", 12026],
        ],
    )

    resultado = service.importar_programacion_desde_excel(
        archivo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert resultado["creadas"] == 2
    assert resultado["creadas_sin_docente"] == 1
    assert resultado["omitidas"] == []
    programaciones = service.listar_programaciones()
    sin_docente = [p for p in programaciones if p.materia == "Cálculo I"]
    assert len(sin_docente) == 1
    assert sin_docente[0].docente_id is None


def test_importar_excel_sin_numero_documento_se_importa_sin_docente_no_se_omite():
    _salon("101")
    archivo = _workbook_bytes(
        ["dia", "horario", "aula", "materia", "semestre"],
        [["Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )

    resultado = service.importar_programacion_desde_excel(
        archivo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert resultado["creadas"] == 1
    assert resultado["creadas_sin_docente"] == 1
    assert resultado["omitidas"] == []


def test_reimportar_el_mismo_archivo_es_seguro_semestre_idempotente_y_filas_duplicadas_omitidas():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )

    primera = service.importar_programacion_desde_excel(
        archivo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )
    segunda = service.importar_programacion_desde_excel(
        archivo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert primera["creadas"] == 1
    assert segunda["creadas"] == 0
    assert len(segunda["omitidas"]) == 1
    assert "solapa" in segunda["omitidas"][0]["motivo"]
    assert segunda["semestre"].id == primera["semestre"].id


# ------------------------------------------------------------------
# importar_programacion_desde_excel — fechas de semestre embebidas en el
# archivo (FIX: antes eran obligatorias como Form param manual; ahora el
# Excel es la fuente de verdad, ver excel_import.extraer_fechas_semestre).
# ------------------------------------------------------------------


def test_importar_excel_usa_las_fechas_embebidas_en_el_archivo_sin_parametros_manuales():
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

    resultado = service.importar_programacion_desde_excel(archivo, None, None)

    assert resultado["creadas"] == 1
    assert resultado["semestre"].fecha_inicio == datetime.date(2026, 1, 15)
    assert resultado["semestre"].fecha_fin == datetime.date(2026, 6, 15)


def test_importar_excel_prioriza_fechas_del_archivo_sobre_el_fallback_manual():
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

    # Fechas manuales deliberadamente distintas a las del archivo: deben
    # ser ignoradas porque el archivo SÍ trae sus propias columnas.
    resultado = service.importar_programacion_desde_excel(
        archivo, datetime.date(2099, 1, 1), datetime.date(2099, 6, 1)
    )

    assert resultado["semestre"].fecha_inicio == datetime.date(2026, 1, 15)
    assert resultado["semestre"].fecha_fin == datetime.date(2026, 6, 15)


def test_importar_excel_sin_fechas_en_archivo_cae_al_fallback_manual():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )

    resultado = service.importar_programacion_desde_excel(
        archivo, datetime.date(2026, 1, 15), datetime.date(2026, 6, 15)
    )

    assert resultado["semestre"].fecha_inicio == datetime.date(2026, 1, 15)
    assert resultado["semestre"].fecha_fin == datetime.date(2026, 6, 15)


def test_importar_excel_sin_fechas_en_archivo_ni_fallback_manual_da_value_error():
    _salon("101")
    _docente("1000000001")
    archivo = _workbook_bytes(
        ["numero_documento", "dia", "horario", "aula", "materia", "semestre"],
        [["1000000001", "Lunes", "8:00 A 10:00", "101", "Cálculo I", 12026]],
    )

    with pytest.raises(ValueError, match="fechas de inicio o fin"):
        service.importar_programacion_desde_excel(archivo, None, None)
