"""
Tests de monitores/domain.py — lógica pura, sin DB ni I/O. Por eso, a
diferencia del resto de tests del módulo, no llevan
`pytestmark = pytest.mark.django_db`.
"""

import pytest

from monitores.domain import validar_docente_distinto_de_monitor


def test_docente_distinto_de_monitor_no_lanza():
    validar_docente_distinto_de_monitor(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    )


def test_docente_igual_a_monitor_lanza_value_error():
    with pytest.raises(ValueError, match="monitor delegado"):
        validar_docente_distinto_de_monitor(
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000001",
        )


def test_compara_ids_por_valor_no_por_tipo():
    # Un UUID del ORM y su representación str deben reconocerse como la
    # misma persona, igual convención que
    # usuarios.domain.validar_desactivacion.
    import uuid

    persona_id = uuid.uuid4()

    with pytest.raises(ValueError):
        validar_docente_distinto_de_monitor(persona_id, str(persona_id))
