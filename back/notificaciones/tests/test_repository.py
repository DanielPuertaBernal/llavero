"""
Tests de notificaciones/repository.py contra una base de datos de test
real (Postgres, vía pytest-django) — sin mocks, tal como pide la
convención TDD del proyecto.

Los fixtures cross-módulo (persona destinataria, usuario que envía) se
crean vía la API pública de `comunidad.service`/`usuarios.service`, nunca
vía sus `repository`/`model` — la regla dura de módulos aplica también en
tests (ver `novedades/tests/test_repository.py`, `llaves/tests/
test_repository.py`).
"""

import pytest
from django.db import IntegrityError, connection

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from notificaciones import repository
from notificaciones.model import EstadoEnvioNotificacion, TipoNotificacion
from usuarios import service as usuarios_service


pytestmark = pytest.mark.django_db


def _persona(numero_documento="1000000001", nombre="Persona Prueba", correo="persona@uco.edu.co"):
    tipo_persona = catalogos_service.crear_tipo_persona(f"tipo-{numero_documento}")
    return comunidad_service.crear_persona(
        numero_documento, nombre, tipo_persona.id, correo=correo
    )


def _usuario(email="usuario-1@uco.edu.co", nombre="Usuario Prueba"):
    rol = catalogos_service.crear_rol(f"rol-{email}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-{email}")
    return usuarios_service.crear_usuario(nombre, email, rol.id, ubicacion.id)


# ------------------------------------------------------------------
# crear_notificacion
# ------------------------------------------------------------------


def test_crear_notificacion_manual_la_persiste_con_sus_valores():
    persona = _persona()
    usuario = _usuario()

    notificacion = repository.crear_notificacion(
        persona.id,
        TipoNotificacion.MANUAL,
        EstadoEnvioNotificacion.ENVIADO,
        asunto="Aviso",
        mensaje="Mensaje de prueba",
        enviado_por_id=usuario.id,
    )

    assert notificacion.id is not None
    assert notificacion.destinatario_id == persona.id
    assert notificacion.tipo == TipoNotificacion.MANUAL
    assert notificacion.asunto == "Aviso"
    assert notificacion.mensaje == "Mensaje de prueba"
    assert notificacion.estado_envio == EstadoEnvioNotificacion.ENVIADO
    assert notificacion.enviado_por_id == usuario.id


def test_crear_notificacion_automatica_sin_enviado_por_lo_permite():
    persona = _persona()

    notificacion = repository.crear_notificacion(
        persona.id,
        TipoNotificacion.RECORDATORIO,
        EstadoEnvioNotificacion.ENVIADO,
        mensaje="Recuerda devolver la llave",
    )

    assert notificacion.enviado_por_id is None
    assert notificacion.asunto is None


def test_crear_notificacion_con_tipo_invalido_falla_por_check_constraint():
    persona = _persona()

    with pytest.raises(IntegrityError):
        repository.crear_notificacion(persona.id, "invalido", EstadoEnvioNotificacion.ENVIADO)


def test_crear_notificacion_con_estado_envio_invalido_falla_por_check_constraint():
    persona = _persona()

    with pytest.raises(IntegrityError):
        repository.crear_notificacion(persona.id, TipoNotificacion.MANUAL, "invalido")


def test_crear_notificacion_con_destinatario_inexistente_falla_por_fk():
    with pytest.raises(IntegrityError):
        repository.crear_notificacion(
            "00000000-0000-0000-0000-000000000000",
            TipoNotificacion.MANUAL,
            EstadoEnvioNotificacion.ENVIADO,
        )
        connection.check_constraints()


def test_crear_notificacion_con_enviado_por_inexistente_falla_por_fk():
    persona = _persona()

    with pytest.raises(IntegrityError):
        repository.crear_notificacion(
            persona.id,
            TipoNotificacion.MANUAL,
            EstadoEnvioNotificacion.ENVIADO,
            enviado_por_id="00000000-0000-0000-0000-000000000000",
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# obtener_por_id / listar_notificaciones
# ------------------------------------------------------------------


def test_obtener_por_id_inexistente_devuelve_none():
    assert repository.obtener_por_id("00000000-0000-0000-0000-000000000000") is None


def test_obtener_por_id_existente_lo_devuelve():
    persona = _persona()
    creada = repository.crear_notificacion(
        persona.id, TipoNotificacion.MANUAL, EstadoEnvioNotificacion.ENVIADO
    )

    assert repository.obtener_por_id(creada.id).id == creada.id


def test_listar_notificaciones():
    persona = _persona()
    repository.crear_notificacion(
        persona.id, TipoNotificacion.MANUAL, EstadoEnvioNotificacion.ENVIADO
    )
    repository.crear_notificacion(
        persona.id, TipoNotificacion.RECORDATORIO, EstadoEnvioNotificacion.FALLIDO
    )

    tipos = {n.tipo for n in repository.listar_notificaciones()}

    assert {TipoNotificacion.MANUAL, TipoNotificacion.RECORDATORIO} <= tipos


# ------------------------------------------------------------------
# listar_por_destinatario / listar_por_tipo / listar_por_estado_envio
# ------------------------------------------------------------------


def test_listar_por_destinatario():
    persona_1 = _persona("1000000001", "Persona Uno", correo="uno@uco.edu.co")
    persona_2 = _persona("1000000002", "Persona Dos", correo="dos@uco.edu.co")
    de_persona_1 = repository.crear_notificacion(
        persona_1.id, TipoNotificacion.MANUAL, EstadoEnvioNotificacion.ENVIADO
    )
    de_persona_2 = repository.crear_notificacion(
        persona_2.id, TipoNotificacion.MANUAL, EstadoEnvioNotificacion.ENVIADO
    )

    resultado = repository.listar_por_destinatario(persona_1.id)

    assert {n.id for n in resultado} == {de_persona_1.id}
    assert de_persona_2.id not in {n.id for n in resultado}


def test_listar_por_tipo():
    persona = _persona()
    manual = repository.crear_notificacion(
        persona.id, TipoNotificacion.MANUAL, EstadoEnvioNotificacion.ENVIADO
    )
    recordatorio = repository.crear_notificacion(
        persona.id, TipoNotificacion.RECORDATORIO, EstadoEnvioNotificacion.ENVIADO
    )

    resultado = repository.listar_por_tipo(TipoNotificacion.MANUAL)

    assert {n.id for n in resultado} >= {manual.id}
    assert recordatorio.id not in {n.id for n in resultado}


def test_listar_por_estado_envio():
    persona = _persona()
    enviado = repository.crear_notificacion(
        persona.id, TipoNotificacion.MANUAL, EstadoEnvioNotificacion.ENVIADO
    )
    fallido = repository.crear_notificacion(
        persona.id, TipoNotificacion.MANUAL, EstadoEnvioNotificacion.FALLIDO
    )

    resultado = repository.listar_por_estado_envio(EstadoEnvioNotificacion.FALLIDO)

    assert {n.id for n in resultado} >= {fallido.id}
    assert enviado.id not in {n.id for n in resultado}
