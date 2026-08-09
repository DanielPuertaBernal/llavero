"""
Tests de configuracion/service.py — la lógica que agrega valor sobre el
repository: validación de ubicacion_defecto_id (contra catalogos.service,
nunca catalogos.repository/model — regla dura del proyecto) y, sobre
todo, el patrón de singleton de aplicación (ver el docstring de
service.py para la justificación completa de la decisión de diseño):

- `crear_configuracion` rechaza crear una segunda fila si ya existe una.
- `obtener_configuracion` es un get-or-create: nunca devuelve None, a
  diferencia de la convención `dict.get()` que usa el resto de
  `obtener_*` del proyecto.
"""

import pytest

from catalogos import service as catalogos_service
from configuracion import repository, service

pytestmark = pytest.mark.django_db


def _ubicacion(nombre="ubicacion-test-configuracion-service"):
    return catalogos_service.crear_ubicacion(nombre)


# ------------------------------------------------------------------
# crear_configuracion
# ------------------------------------------------------------------


def test_crear_configuracion_con_ubicacion_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="ubicacion"):
        service.crear_configuracion("00000000-0000-0000-0000-000000000000")


def test_crear_configuracion_con_referencia_valida_delega_al_repository():
    ubicacion = _ubicacion()

    configuracion = service.crear_configuracion(ubicacion.id)

    assert configuracion.ubicacion_defecto_id == ubicacion.id
    assert configuracion.limite_antes_mora_minutos == 120
    assert configuracion.max_reintentos_recordatorio == 3
    assert configuracion.limite_no_reclamada_minutos == 30


def test_crear_configuracion_si_ya_existe_una_fila_da_value_error_claro():
    # Decisión de diseño de este módulo: configuracion opera como
    # singleton de aplicación aunque el DDL no lo restrinja con un
    # UNIQUE/CHECK (ver docstring de service.py). crear_configuracion no
    # permite una segunda fila.
    ubicacion = _ubicacion()
    service.crear_configuracion(ubicacion.id)

    with pytest.raises(ValueError, match="[Yy]a existe"):
        service.crear_configuracion(ubicacion.id)


# ------------------------------------------------------------------
# obtener_configuracion (get-or-create)
# ------------------------------------------------------------------


def test_obtener_configuracion_crea_una_por_defecto_si_no_existe_ninguna():
    # El seed de catalogos (migración 0002) garantiza al menos las 3
    # ubicaciones base, así que siempre hay una candidata disponible para
    # el ubicacion_defecto_id provisorio de este get-or-create.
    assert repository.obtener_configuracion() is None

    configuracion = service.obtener_configuracion()

    assert configuracion is not None
    assert configuracion.limite_antes_mora_minutos == 120
    assert configuracion.max_reintentos_recordatorio == 3
    assert configuracion.plantilla_recordatorio is None
    assert configuracion.ubicacion_defecto_id is not None
    assert configuracion.limite_no_reclamada_minutos == 30
    assert repository.obtener_configuracion().id == configuracion.id


def test_obtener_configuracion_no_duplica_la_fila_en_llamadas_sucesivas():
    primera = service.obtener_configuracion()
    segunda = service.obtener_configuracion()

    assert primera.id == segunda.id


def test_obtener_configuracion_devuelve_la_existente_sin_tocarla():
    ubicacion = _ubicacion()
    creada = service.crear_configuracion(
        ubicacion.id, limite_antes_mora_minutos=45, max_reintentos_recordatorio=7
    )

    obtenida = service.obtener_configuracion()

    assert obtenida.id == creada.id
    assert obtenida.limite_antes_mora_minutos == 45
    assert obtenida.max_reintentos_recordatorio == 7


# ------------------------------------------------------------------
# actualizar_configuracion
# ------------------------------------------------------------------


def test_actualizar_configuracion_con_ubicacion_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="ubicacion"):
        service.actualizar_configuracion(
            "00000000-0000-0000-0000-000000000000",
            limite_antes_mora_minutos=90,
            max_reintentos_recordatorio=1,
            plantilla_recordatorio=None,
        )


def test_actualizar_configuracion_reemplaza_los_campos_de_la_fila_existente():
    ubicacion = _ubicacion()
    otra_ubicacion = _ubicacion("ubicacion-test-configuracion-service-2")
    service.crear_configuracion(ubicacion.id)

    actualizada = service.actualizar_configuracion(
        otra_ubicacion.id,
        limite_antes_mora_minutos=90,
        max_reintentos_recordatorio=1,
        plantilla_recordatorio="Nueva plantilla",
        limite_no_reclamada_minutos=45,
    )

    assert actualizada.ubicacion_defecto_id == otra_ubicacion.id
    assert actualizada.limite_antes_mora_minutos == 90
    assert actualizada.max_reintentos_recordatorio == 1
    assert actualizada.plantilla_recordatorio == "Nueva plantilla"
    assert actualizada.limite_no_reclamada_minutos == 45


def test_actualizar_configuracion_crea_la_fila_si_todavia_no_existia():
    # actualizar_configuracion se apoya en el get-or-create de
    # obtener_configuracion: quien llama no necesita crear la fila a mano
    # primero.
    ubicacion = _ubicacion()
    assert repository.obtener_configuracion() is None

    actualizada = service.actualizar_configuracion(
        ubicacion.id,
        limite_antes_mora_minutos=30,
        max_reintentos_recordatorio=2,
        plantilla_recordatorio="Plantilla inicial",
    )

    assert actualizada.ubicacion_defecto_id == ubicacion.id
    assert actualizada.limite_antes_mora_minutos == 30
    assert repository.obtener_configuracion().id == actualizada.id
