"""
Tests de auth/domain.py — lógica pura, sin DB ni I/O. Por eso, a diferencia
del resto de tests del módulo, no llevan `pytestmark = pytest.mark.django_db`.

Los dobles de "sesión" usados acá son namedtuples minimalistas (solo los
atributos que domain.py realmente lee) en vez de instancias reales de
SesionRefresh — no hace falta ORM ni base de datos para testear decisiones
puras.
"""

from collections import namedtuple
from datetime import datetime, timedelta, timezone

import pytest

from auth.domain import (
    codigo_vigente,
    es_intento_de_reuso,
    sesion_vigente,
    sesiones_a_revocar_por_tope,
)

Sesion = namedtuple("Sesion", ["fecha_emision", "fecha_expiracion", "fecha_revocacion"])
CodigoTemporal = namedtuple("CodigoTemporal", ["fecha_expiracion", "usado"])

AHORA = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _sesion(emitida_hace_horas=0, expira_en_horas=1, revocada=False):
    return Sesion(
        fecha_emision=AHORA - timedelta(hours=emitida_hace_horas),
        fecha_expiracion=AHORA + timedelta(hours=expira_en_horas),
        fecha_revocacion=AHORA if revocada else None,
    )


# ------------------------------------------------------------------
# sesion_vigente
# ------------------------------------------------------------------


def test_sesion_vigente_no_revocada_y_no_expirada_es_vigente():
    sesion = _sesion(expira_en_horas=1, revocada=False)

    assert sesion_vigente(sesion, AHORA) is True


def test_sesion_revocada_no_es_vigente():
    sesion = _sesion(expira_en_horas=1, revocada=True)

    assert sesion_vigente(sesion, AHORA) is False


def test_sesion_expirada_no_es_vigente():
    sesion = _sesion(expira_en_horas=-1, revocada=False)

    assert sesion_vigente(sesion, AHORA) is False


# ------------------------------------------------------------------
# es_intento_de_reuso
# ------------------------------------------------------------------


def test_es_intento_de_reuso_si_la_sesion_no_existe():
    assert es_intento_de_reuso(None) is True


def test_es_intento_de_reuso_si_la_sesion_ya_esta_revocada():
    sesion = _sesion(revocada=True)

    assert es_intento_de_reuso(sesion) is True


def test_no_es_intento_de_reuso_si_la_sesion_esta_vigente():
    sesion = _sesion(revocada=False)

    assert es_intento_de_reuso(sesion) is False


# ------------------------------------------------------------------
# sesiones_a_revocar_por_tope
# ------------------------------------------------------------------


def test_sin_superar_el_tope_no_hay_que_revocar_nada():
    sesiones = [_sesion(emitida_hace_horas=h) for h in range(4)]

    assert sesiones_a_revocar_por_tope(sesiones, tope=5) == []


def test_en_el_tope_exacto_revoca_solo_la_mas_antigua():
    # 5 sesiones vigentes + 1 nueva por emitir supera el tope de 5: hay que
    # liberar exactamente 1 cupo, la más antigua.
    mas_antigua = _sesion(emitida_hace_horas=10)
    sesiones = [mas_antigua] + [_sesion(emitida_hace_horas=h) for h in range(4)]

    resultado = sesiones_a_revocar_por_tope(sesiones, tope=5)

    assert resultado == [mas_antigua]


def test_por_encima_del_tope_revoca_todo_el_exceso_mas_antiguo():
    # Caso defensivo: si por algún motivo ya hay más sesiones vigentes que
    # el tope, se liberan cupos suficientes para que, tras sumar la nueva,
    # quede exactamente en el tope.
    sesiones = [_sesion(emitida_hace_horas=h) for h in range(7)]  # 0..6 horas atrás

    resultado = sesiones_a_revocar_por_tope(sesiones, tope=5)

    # Deben revocarse las 3 más antiguas (5, 6 y... ver conteo): 7 vigentes,
    # tope 5 -> exceso = 7 - 5 + 1 = 3 sesiones más antiguas.
    horas_revocadas = sorted(
        (AHORA - s.fecha_emision).total_seconds() / 3600 for s in resultado
    )
    assert horas_revocadas == [4.0, 5.0, 6.0]


def test_no_muta_la_lista_original():
    sesiones = [_sesion(emitida_hace_horas=h) for h in range(6)]
    copia = list(sesiones)

    sesiones_a_revocar_por_tope(sesiones, tope=5)

    assert sesiones == copia


# ------------------------------------------------------------------
# codigo_vigente
# ------------------------------------------------------------------


def _codigo(expira_en_segundos=60, usado=False):
    return CodigoTemporal(
        fecha_expiracion=AHORA + timedelta(seconds=expira_en_segundos),
        usado=usado,
    )


def test_codigo_no_usado_y_no_expirado_es_vigente():
    codigo = _codigo(expira_en_segundos=60, usado=False)

    assert codigo_vigente(codigo, AHORA) is True


def test_codigo_usado_no_es_vigente():
    codigo = _codigo(expira_en_segundos=60, usado=True)

    assert codigo_vigente(codigo, AHORA) is False


def test_codigo_expirado_no_es_vigente():
    codigo = _codigo(expira_en_segundos=-1, usado=False)

    assert codigo_vigente(codigo, AHORA) is False
