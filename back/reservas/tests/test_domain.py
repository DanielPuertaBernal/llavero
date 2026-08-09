"""
Tests de reservas/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`: no hace falta la base de datos para
probar una función de decisión.

Casos idénticos a `programacion/tests/test_domain.py` — misma función en
comportamiento, reimplementada acá deliberadamente (ver docstring de
`reservas/domain.py`).
"""

import datetime

from django.utils import timezone

from reservas.domain import es_no_reclamada, hay_solapamiento


def _hora(h: int, m: int = 0) -> datetime.time:
    return datetime.time(h, m)


def test_franjas_identicas_se_solapan():
    assert hay_solapamiento(_hora(8), _hora(10), _hora(8), _hora(10)) is True


def test_franja_contenida_dentro_de_otra_se_solapa():
    assert hay_solapamiento(_hora(8), _hora(12), _hora(9), _hora(10)) is True


def test_franjas_parcialmente_superpuestas_se_solapan():
    assert hay_solapamiento(_hora(8), _hora(10), _hora(9), _hora(11)) is True


def test_franjas_adyacentes_no_se_solapan():
    # Una termina exactamente cuando empieza la otra: válido según el DDL
    # (hora_inicio < hora_fin en cada fila, sin exigir separación extra).
    assert hay_solapamiento(_hora(8), _hora(10), _hora(10), _hora(12)) is False


def test_franjas_completamente_separadas_no_se_solapan():
    assert hay_solapamiento(_hora(8), _hora(9), _hora(10), _hora(11)) is False


def test_solapamiento_es_simetrico():
    a_inicio, a_fin = _hora(9), _hora(11)
    b_inicio, b_fin = _hora(8), _hora(10)

    assert hay_solapamiento(a_inicio, a_fin, b_inicio, b_fin) == hay_solapamiento(
        b_inicio, b_fin, a_inicio, a_fin
    )


# ------------------------------------------------------------------
# es_no_reclamada
# ------------------------------------------------------------------


def test_es_no_reclamada_exactamente_en_el_limite_es_false():
    fecha = datetime.date(2026, 3, 10)
    hora_inicio = _hora(8)
    ahora = timezone.make_aware(datetime.datetime(2026, 3, 10, 8, 30))

    assert es_no_reclamada(fecha, hora_inicio, 30, ahora) is False


def test_es_no_reclamada_un_segundo_despues_del_limite_es_true():
    fecha = datetime.date(2026, 3, 10)
    hora_inicio = _hora(8)
    ahora = timezone.make_aware(datetime.datetime(2026, 3, 10, 8, 30, 1))

    assert es_no_reclamada(fecha, hora_inicio, 30, ahora) is True


def test_es_no_reclamada_antes_del_limite_es_false():
    fecha = datetime.date(2026, 3, 10)
    hora_inicio = _hora(8)
    ahora = timezone.make_aware(datetime.datetime(2026, 3, 10, 8, 15))

    assert es_no_reclamada(fecha, hora_inicio, 30, ahora) is False
