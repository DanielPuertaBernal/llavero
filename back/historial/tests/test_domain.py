"""
Tests de historial/domain.py — lógica pura (sin DB, sin I/O) que
`service.listar_historial` usa para (a) ordenar la lista unificada de
eventos por fecha/hora, más reciente primero, y (b) filtrar esa lista a
los eventos procesados por un `usuario_id` concreto (RF28: Portero ve
solo lo que él mismo procesó).

Mismo criterio que `disponibilidad/tests/test_domain.py`/
`nfc/tests/test_domain.py`: se testea con dicts a mano, sin tocar base
de datos — estas dos funciones no saben nada de `llaves`/`prestamos`.
"""

from historial import domain


def _evento(fecha_hora: str, procesado_por_id: str = "usuario-1"):
    return {"fecha_hora": fecha_hora, "procesado_por_id": procesado_por_id}


def test_ordenar_por_fecha_desc_ordena_mas_reciente_primero():
    viejo = _evento("2026-01-01T08:00:00+00:00")
    nuevo = _evento("2026-03-01T08:00:00+00:00")
    intermedio = _evento("2026-02-01T08:00:00+00:00")

    resultado = domain.ordenar_por_fecha_desc([viejo, nuevo, intermedio])

    assert resultado == [nuevo, intermedio, viejo]


def test_ordenar_por_fecha_desc_no_muta_la_lista_original():
    viejo = _evento("2026-01-01T08:00:00+00:00")
    nuevo = _evento("2026-03-01T08:00:00+00:00")
    original = [viejo, nuevo]

    domain.ordenar_por_fecha_desc(original)

    assert original == [viejo, nuevo]


def test_ordenar_por_fecha_desc_con_lista_vacia_da_lista_vacia():
    assert domain.ordenar_por_fecha_desc([]) == []


def test_filtrar_por_procesado_por_deja_solo_los_del_usuario_dado():
    de_ana = _evento("2026-01-01T08:00:00+00:00", "ana-id")
    de_luis = _evento("2026-01-02T08:00:00+00:00", "luis-id")
    otro_de_ana = _evento("2026-01-03T08:00:00+00:00", "ana-id")

    resultado = domain.filtrar_por_procesado_por(
        [de_ana, de_luis, otro_de_ana], "ana-id"
    )

    assert resultado == [de_ana, otro_de_ana]


def test_filtrar_por_procesado_por_sin_coincidencias_da_lista_vacia():
    de_luis = _evento("2026-01-02T08:00:00+00:00", "luis-id")

    assert domain.filtrar_por_procesado_por([de_luis], "ana-id") == []
