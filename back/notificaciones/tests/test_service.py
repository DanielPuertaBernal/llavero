"""
Tests de notificaciones/service.py — validación de FKs cross-módulo
(destinatario_id vía comunidad.service, enviado_por_id vía usuarios.
service), la plantilla de configuracion para `enviar_recordatorio` y,
sobre todo, el envío real por SMTP (camino feliz y camino de fallo).

Camino feliz: se activa el backend de pruebas de Django
(`locmem.EmailBackend`, vía `@override_settings`) y se inspecciona
`django.core.mail.outbox` — sin red real.

Camino de fallo: se mockea `notificaciones.service.send_mail` para que
lance una excepción de red/protocolo simulada, y se verifica que la
Notificacion se persiste igual con `estado_envio='fallido'`, sin que la
excepción se propague al caller del test (ver nota de diseño en
service.py).
"""

import smtplib
from unittest.mock import patch

import pytest
from django.core import mail
from django.test import override_settings

from catalogos import service as catalogos_service
from comunidad import service as comunidad_service
from configuracion import service as configuracion_service
from notificaciones import repository, service
from notificaciones.model import EstadoEnvioNotificacion, TipoNotificacion
from usuarios import service as usuarios_service


pytestmark = pytest.mark.django_db

LOCMEM_BACKEND = "django.core.mail.backends.locmem.EmailBackend"


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
# enviar_notificacion_manual — validación de referencias
# ------------------------------------------------------------------


def test_enviar_notificacion_manual_con_destinatario_inexistente_da_value_error_claro():
    usuario = _usuario()

    with pytest.raises(ValueError, match="destinatario"):
        service.enviar_notificacion_manual(
            "00000000-0000-0000-0000-000000000000", "Aviso", "Mensaje", usuario.id
        )


def test_enviar_notificacion_manual_con_enviado_por_inexistente_da_value_error_claro():
    persona = _persona()

    with pytest.raises(ValueError, match="enviado_por"):
        service.enviar_notificacion_manual(
            persona.id, "Aviso", "Mensaje", "00000000-0000-0000-0000-000000000000"
        )


# ------------------------------------------------------------------
# enviar_notificacion_manual — camino feliz (locmem)
# ------------------------------------------------------------------


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_enviar_notificacion_manual_exitosa_queda_enviado_y_llega_al_outbox():
    persona = _persona(correo="destino@uco.edu.co")
    usuario = _usuario()

    notificacion = service.enviar_notificacion_manual(
        persona.id, "Aviso importante", "Cuerpo del mensaje", usuario.id
    )

    assert notificacion.estado_envio == EstadoEnvioNotificacion.ENVIADO
    assert notificacion.tipo == TipoNotificacion.MANUAL
    assert notificacion.enviado_por_id == usuario.id
    assert len(mail.outbox) == 1
    assert mail.outbox[0].subject == "Aviso importante"
    assert mail.outbox[0].body == "Cuerpo del mensaje"
    assert mail.outbox[0].to == ["destino@uco.edu.co"]


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_enviar_notificacion_manual_sin_correo_registrado_queda_fallido_sin_enviar():
    persona = _persona(correo=None)
    usuario = _usuario()

    notificacion = service.enviar_notificacion_manual(
        persona.id, "Aviso", "Mensaje", usuario.id
    )

    assert notificacion.estado_envio == EstadoEnvioNotificacion.FALLIDO
    assert len(mail.outbox) == 0


# ------------------------------------------------------------------
# enviar_notificacion_manual — camino de fallo (mock de send_mail)
# ------------------------------------------------------------------


def test_enviar_notificacion_manual_con_fallo_smtp_queda_fallido_sin_propagar():
    persona = _persona()
    usuario = _usuario()

    with patch("notificaciones.service.send_mail", side_effect=smtplib.SMTPException("boom")):
        notificacion = service.enviar_notificacion_manual(
            persona.id, "Aviso", "Mensaje", usuario.id
        )

    assert notificacion.estado_envio == EstadoEnvioNotificacion.FALLIDO
    persistida = repository.obtener_por_id(notificacion.id)
    assert persistida.estado_envio == EstadoEnvioNotificacion.FALLIDO


def test_enviar_notificacion_manual_con_fallo_de_red_queda_fallido_sin_propagar():
    persona = _persona()
    usuario = _usuario()

    with patch("notificaciones.service.send_mail", side_effect=OSError("host inalcanzable")):
        notificacion = service.enviar_notificacion_manual(
            persona.id, "Aviso", "Mensaje", usuario.id
        )

    assert notificacion.estado_envio == EstadoEnvioNotificacion.FALLIDO


# ------------------------------------------------------------------
# enviar_recordatorio — plantilla de configuracion / mensaje explícito
# ------------------------------------------------------------------


def test_enviar_recordatorio_con_destinatario_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="destinatario"):
        service.enviar_recordatorio("00000000-0000-0000-0000-000000000000")


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_enviar_recordatorio_sin_mensaje_usa_plantilla_de_configuracion():
    persona = _persona()
    configuracion_service.actualizar_configuracion(
        configuracion_service.obtener_configuracion().ubicacion_defecto_id,
        120,
        3,
        plantilla_recordatorio="Recuerda devolver la llave a tiempo",
    )

    notificacion = service.enviar_recordatorio(persona.id)

    assert notificacion.mensaje == "Recuerda devolver la llave a tiempo"
    assert notificacion.tipo == TipoNotificacion.RECORDATORIO
    assert notificacion.enviado_por_id is None
    assert mail.outbox[0].body == "Recuerda devolver la llave a tiempo"


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_enviar_recordatorio_con_mensaje_explicito_ignora_la_plantilla():
    persona = _persona()
    configuracion_service.actualizar_configuracion(
        configuracion_service.obtener_configuracion().ubicacion_defecto_id,
        120,
        3,
        plantilla_recordatorio="Plantilla por defecto",
    )

    notificacion = service.enviar_recordatorio(persona.id, mensaje="Mensaje a medida")

    assert notificacion.mensaje == "Mensaje a medida"


# ------------------------------------------------------------------
# enviar_vencimiento
# ------------------------------------------------------------------


def test_enviar_vencimiento_con_destinatario_inexistente_da_value_error_claro():
    with pytest.raises(ValueError, match="destinatario"):
        service.enviar_vencimiento("00000000-0000-0000-0000-000000000000", "Mensaje")


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_enviar_vencimiento_exitoso_queda_enviado():
    persona = _persona()

    notificacion = service.enviar_vencimiento(persona.id, "La llave está en mora")

    assert notificacion.estado_envio == EstadoEnvioNotificacion.ENVIADO
    assert notificacion.tipo == TipoNotificacion.VENCIMIENTO
    assert notificacion.enviado_por_id is None
    assert notificacion.mensaje == "La llave está en mora"


def test_enviar_vencimiento_con_fallo_smtp_queda_fallido_sin_propagar():
    persona = _persona()

    with patch("notificaciones.service.send_mail", side_effect=smtplib.SMTPException("boom")):
        notificacion = service.enviar_vencimiento(persona.id, "La llave está en mora")

    assert notificacion.estado_envio == EstadoEnvioNotificacion.FALLIDO


# ------------------------------------------------------------------
# obtener_notificacion / listar_*
# ------------------------------------------------------------------


def test_obtener_notificacion_inexistente_devuelve_none():
    assert service.obtener_notificacion("00000000-0000-0000-0000-000000000000") is None


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_obtener_notificacion_existente_la_devuelve():
    persona = _persona()
    creada = service.enviar_vencimiento(persona.id, "Mensaje")

    assert service.obtener_notificacion(creada.id).id == creada.id


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_listar_notificaciones_delega_al_repository():
    persona = _persona()
    service.enviar_vencimiento(persona.id, "Mensaje")

    tipos = {n.tipo for n in service.listar_notificaciones()}

    assert TipoNotificacion.VENCIMIENTO in tipos


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_listar_por_destinatario_solo_devuelve_las_de_esa_persona():
    persona_1 = _persona("1000000001", "Persona Uno", correo="uno@uco.edu.co")
    persona_2 = _persona("1000000002", "Persona Dos", correo="dos@uco.edu.co")
    de_persona_1 = service.enviar_vencimiento(persona_1.id, "Mensaje")
    de_persona_2 = service.enviar_vencimiento(persona_2.id, "Mensaje")

    resultado = service.listar_por_destinatario(persona_1.id)

    assert de_persona_1.id in {n.id for n in resultado}
    assert de_persona_2.id not in {n.id for n in resultado}


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_listar_por_tipo_solo_devuelve_ese_tipo():
    persona = _persona()
    vencimiento = service.enviar_vencimiento(persona.id, "Mensaje")
    recordatorio = service.enviar_recordatorio(persona.id, mensaje="Recordatorio")

    resultado = service.listar_por_tipo(TipoNotificacion.VENCIMIENTO)

    assert vencimiento.id in {n.id for n in resultado}
    assert recordatorio.id not in {n.id for n in resultado}


@override_settings(EMAIL_BACKEND=LOCMEM_BACKEND)
def test_listar_por_estado_envio_solo_devuelve_ese_estado():
    persona_ok = _persona("1000000001", "Persona Ok", correo="ok@uco.edu.co")
    persona_sin_correo = _persona("1000000002", "Persona Sin Correo", correo=None)
    enviada = service.enviar_vencimiento(persona_ok.id, "Mensaje")
    fallida = service.enviar_vencimiento(persona_sin_correo.id, "Mensaje")

    resultado = service.listar_por_estado_envio(EstadoEnvioNotificacion.FALLIDO)

    assert fallida.id in {n.id for n in resultado}
    assert enviada.id not in {n.id for n in resultado}
