"""
Tests de comunidad/service.py — la lógica que agrega valor sobre el
repository: validación de tipo_persona_id (contra catalogos.service,
nunca catalogos.repository/model — regla dura del proyecto) y el upsert
por numero_documento (crear_o_actualizar_por_documento) pensado para el
futuro sync del ETL. Los passthrough directos ya están cubiertos
transitivamente por test_repository.py.
"""

import pytest

from catalogos import service as catalogos_service
from comunidad import repository, service

pytestmark = pytest.mark.django_db


def _tipo_persona(nombre="tipo-test-comunidad-service"):
    return catalogos_service.crear_tipo_persona(nombre)


# ------------------------------------------------------------------
# crear_persona
# ------------------------------------------------------------------


def test_crear_persona_con_tipo_persona_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="tipo_persona"):
        service.crear_persona(
            "1000000001",
            "Persona Uno",
            "00000000-0000-0000-0000-000000000000",
        )


def test_crear_persona_con_referencia_valida_delega_al_repository():
    tipo_persona = _tipo_persona()

    persona = service.crear_persona("1000000001", "Persona Uno", tipo_persona.id)

    assert persona.numero_documento == "1000000001"
    assert persona.tipo_persona_id == tipo_persona.id


# ------------------------------------------------------------------
# obtener_*
# ------------------------------------------------------------------


def test_obtener_persona_inexistente_devuelve_none():
    assert service.obtener_persona("00000000-0000-0000-0000-000000000000") is None


def test_obtener_persona_existente_la_devuelve():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)

    assert service.obtener_persona(creada.id).id == creada.id


def test_obtener_por_documento_inexistente_devuelve_none():
    assert service.obtener_por_documento("no-existe") is None


def test_obtener_por_documento_existente_lo_devuelve():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)

    assert service.obtener_por_documento("1000000001").id == creada.id


def test_obtener_por_carnet_inexistente_devuelve_none():
    assert service.obtener_por_carnet("no-existe") is None


def test_obtener_por_carnet_existente_lo_devuelve():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona(
        "1000000001", "Persona Uno", tipo_persona.id, id_carnet="CARNET-1"
    )

    assert service.obtener_por_carnet("CARNET-1").id == creada.id


# ------------------------------------------------------------------
# crear_o_actualizar_por_documento (upsert del ETL)
# ------------------------------------------------------------------


def test_upsert_con_tipo_persona_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="tipo_persona"):
        service.crear_o_actualizar_por_documento(
            "1000000001",
            "Persona Uno",
            "00000000-0000-0000-0000-000000000000",
        )


def test_upsert_crea_la_persona_si_el_documento_no_existe():
    tipo_persona = _tipo_persona()

    persona = service.crear_o_actualizar_por_documento(
        "1000000001", "Persona Uno", tipo_persona.id, id_carnet="CARNET-1"
    )

    assert persona.numero_documento == "1000000001"
    assert persona.nombre == "Persona Uno"
    assert persona.id_carnet == "CARNET-1"
    assert repository.obtener_por_documento("1000000001").id == persona.id


def test_upsert_actualiza_la_persona_si_el_documento_ya_existe():
    tipo_persona = _tipo_persona()
    otro_tipo_persona = _tipo_persona("tipo-test-comunidad-service-2")
    original = repository.crear_persona(
        "1000000001", "Persona Uno", tipo_persona.id, id_carnet="CARNET-1"
    )

    actualizada = service.crear_o_actualizar_por_documento(
        "1000000001",
        "Persona Uno Renombrada",
        otro_tipo_persona.id,
        id_carnet="CARNET-2",
    )

    # Es un update sobre la misma fila (mismo id), no un INSERT nuevo.
    assert actualizada.id == original.id
    assert actualizada.nombre == "Persona Uno Renombrada"
    assert actualizada.tipo_persona_id == otro_tipo_persona.id
    assert actualizada.id_carnet == "CARNET-2"


def test_upsert_no_es_todo_o_nada_de_lote_cada_llamada_es_independiente():
    # Corrección deliberada respecto al legacy (ver service.py): cada
    # llamada es una operación atómica sobre una sola persona. Una
    # llamada inválida no debe afectar el resultado de una llamada
    # válida anterior ni de una posterior.
    tipo_persona = _tipo_persona()
    service.crear_o_actualizar_por_documento("1000000001", "Persona Uno", tipo_persona.id)

    with pytest.raises(ValueError):
        service.crear_o_actualizar_por_documento(
            "1000000002",
            "Persona Dos Inválida",
            "00000000-0000-0000-0000-000000000000",
        )

    service.crear_o_actualizar_por_documento("1000000003", "Persona Tres", tipo_persona.id)

    assert repository.obtener_por_documento("1000000001") is not None
    assert repository.obtener_por_documento("1000000002") is None
    assert repository.obtener_por_documento("1000000003") is not None


# ------------------------------------------------------------------
# eliminar_persona
# ------------------------------------------------------------------


def test_eliminar_persona_existente_devuelve_true():
    tipo_persona = _tipo_persona()
    creada = repository.crear_persona("1000000001", "Persona Uno", tipo_persona.id)

    assert service.eliminar_persona(creada.id) is True
    assert service.obtener_persona(creada.id) is None


def test_eliminar_persona_inexistente_devuelve_false():
    assert service.eliminar_persona("00000000-0000-0000-0000-000000000000") is False
