"""
Tests de auth/repository.py contra una base de datos de test real (Postgres,
vía pytest-django) — sin mocks, tal como pide la convención TDD del
proyecto.

El fixture de usuario que necesita sesion_refresh (FK NOT NULL) se crea vía
`usuarios.service`/`catalogos.service` (las API públicas de esos módulos),
nunca vía sus repository/model directamente — la regla dura de módulos
aplica también en los tests.
"""

from datetime import timedelta

import pytest
from django.db import IntegrityError, connection
from django.utils import timezone

from auth import repository
from catalogos import service as catalogos_service
from usuarios import service as usuarios_service

pytestmark = pytest.mark.django_db


def _usuario(email="ana.perez@uco.edu.co"):
    # rol.nombre es VARCHAR(30) en el DDL: sufijo corto (no el email
    # completo) para no superar el límite de columna.
    sufijo = email.split("@")[0]
    rol = catalogos_service.crear_rol(f"rol-auth-{sufijo}")
    ubicacion = catalogos_service.crear_ubicacion(f"ubicacion-auth-{sufijo}")
    return usuarios_service.crear_usuario("Ana Pérez", email, rol.id, ubicacion.id)


def _expiracion(dias=7):
    return timezone.now() + timedelta(days=dias)


# ------------------------------------------------------------------
# crear_sesion
# ------------------------------------------------------------------


def test_crear_sesion_la_persiste():
    usuario = _usuario()
    expiracion = _expiracion()

    sesion = repository.crear_sesion(usuario.id, "jti-1", expiracion)

    assert sesion.id is not None
    assert sesion.usuario_id == usuario.id
    assert sesion.jti == "jti-1"
    assert sesion.fecha_expiracion == expiracion
    assert sesion.fecha_revocacion is None
    assert sesion.fecha_emision is not None


def test_crear_sesion_con_jti_duplicado_falla_por_unicidad():
    usuario = _usuario()
    repository.crear_sesion(usuario.id, "jti-dup", _expiracion())

    with pytest.raises(IntegrityError):
        repository.crear_sesion(usuario.id, "jti-dup", _expiracion())


def test_crear_sesion_con_usuario_inexistente_falla_por_fk():
    # Postgres declara los FK de Django DEFERRABLE INITIALLY DEFERRED, así
    # que el INSERT en sí no falla — el chequeo real ocurre en
    # check_constraints() (Django lo llama recién al hacer rollback del
    # test). Se fuerza aquí para no depender del orden de teardown (ver
    # catalogos/tests/test_repository.py::test_crear_salon_con_bloque_inexistente_falla_por_fk).
    with pytest.raises(IntegrityError):
        repository.crear_sesion(
            "00000000-0000-0000-0000-000000000000", "jti-huerfano", _expiracion()
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# listar_sesiones_no_revocadas
# ------------------------------------------------------------------


def test_listar_sesiones_no_revocadas_excluye_las_revocadas():
    usuario = _usuario()
    activa = repository.crear_sesion(usuario.id, "jti-activa", _expiracion())
    revocada = repository.crear_sesion(usuario.id, "jti-revocada", _expiracion())
    repository.revocar(revocada.id, timezone.now())

    resultado = {s.jti for s in repository.listar_sesiones_no_revocadas(usuario.id)}

    assert resultado == {"jti-activa"}
    assert activa.jti in resultado


def test_listar_sesiones_no_revocadas_de_usuario_sin_sesiones_es_vacio():
    usuario = _usuario()

    assert repository.listar_sesiones_no_revocadas(usuario.id) == []


def test_listar_sesiones_no_revocadas_no_mezcla_usuarios():
    usuario_1 = _usuario("uno@uco.edu.co")
    usuario_2 = _usuario("dos@uco.edu.co")
    repository.crear_sesion(usuario_1.id, "jti-u1", _expiracion())
    repository.crear_sesion(usuario_2.id, "jti-u2", _expiracion())

    resultado = {s.jti for s in repository.listar_sesiones_no_revocadas(usuario_1.id)}

    assert resultado == {"jti-u1"}


# ------------------------------------------------------------------
# obtener_por_jti
# ------------------------------------------------------------------


def test_obtener_por_jti_existente():
    usuario = _usuario()
    creada = repository.crear_sesion(usuario.id, "jti-buscado", _expiracion())

    assert repository.obtener_por_jti("jti-buscado").id == creada.id


def test_obtener_por_jti_inexistente_devuelve_none():
    assert repository.obtener_por_jti("jti-no-existe") is None


# ------------------------------------------------------------------
# revocar
# ------------------------------------------------------------------


def test_revocar_marca_fecha_revocacion():
    usuario = _usuario()
    sesion = repository.crear_sesion(usuario.id, "jti-a-revocar", _expiracion())
    momento = timezone.now()

    repository.revocar(sesion.id, momento)

    actualizada = repository.obtener_por_jti("jti-a-revocar")
    assert actualizada.fecha_revocacion == momento


def test_revocar_sesion_inexistente_no_falla():
    # No-op silencioso: mismo contrato que usuarios.repository ante ids que
    # no existen, no lanza excepción.
    repository.revocar("00000000-0000-0000-0000-000000000000", timezone.now())


# ------------------------------------------------------------------
# revocar_todas_las_del_usuario
# ------------------------------------------------------------------


def test_revocar_todas_las_del_usuario_revoca_solo_las_no_revocadas_de_ese_usuario():
    usuario_1 = _usuario("uno@uco.edu.co")
    usuario_2 = _usuario("dos@uco.edu.co")
    s1 = repository.crear_sesion(usuario_1.id, "jti-u1-a", _expiracion())
    s2 = repository.crear_sesion(usuario_1.id, "jti-u1-b", _expiracion())
    otro_usuario = repository.crear_sesion(usuario_2.id, "jti-u2", _expiracion())
    momento = timezone.now()

    repository.revocar_todas_las_del_usuario(usuario_1.id, momento)

    assert repository.obtener_por_jti("jti-u1-a").fecha_revocacion == momento
    assert repository.obtener_por_jti("jti-u1-b").fecha_revocacion == momento
    assert repository.obtener_por_jti("jti-u2").fecha_revocacion is None
    assert repository.listar_sesiones_no_revocadas(usuario_1.id) == []
    assert [s.jti for s in repository.listar_sesiones_no_revocadas(usuario_2.id)] == ["jti-u2"]


# ------------------------------------------------------------------
# crear_codigo_login_temporal
# ------------------------------------------------------------------


def _expiracion_codigo(segundos=90):
    return timezone.now() + timedelta(seconds=segundos)


def test_crear_codigo_login_temporal_lo_persiste():
    usuario = _usuario()
    expiracion = _expiracion_codigo()

    codigo = repository.crear_codigo_login_temporal(usuario.id, "codigo-1", expiracion)

    assert codigo.id is not None
    assert codigo.usuario_id == usuario.id
    assert codigo.codigo == "codigo-1"
    assert codigo.fecha_expiracion == expiracion
    assert codigo.usado is False
    assert codigo.fecha_emision is not None


def test_crear_codigo_login_temporal_con_codigo_duplicado_falla_por_unicidad():
    usuario = _usuario()
    repository.crear_codigo_login_temporal(usuario.id, "codigo-dup", _expiracion_codigo())

    with pytest.raises(IntegrityError):
        repository.crear_codigo_login_temporal(usuario.id, "codigo-dup", _expiracion_codigo())


def test_crear_codigo_login_temporal_con_usuario_inexistente_falla_por_fk():
    # Mismo gotcha que test_crear_sesion_con_usuario_inexistente_falla_por_fk:
    # FK deferrable, se fuerza el chequeo con connection.check_constraints().
    with pytest.raises(IntegrityError):
        repository.crear_codigo_login_temporal(
            "00000000-0000-0000-0000-000000000000", "codigo-huerfano", _expiracion_codigo()
        )
        connection.check_constraints()


# ------------------------------------------------------------------
# obtener_codigo_login_temporal
# ------------------------------------------------------------------


def test_obtener_codigo_login_temporal_existente():
    usuario = _usuario()
    creado = repository.crear_codigo_login_temporal(usuario.id, "codigo-buscado", _expiracion_codigo())

    assert repository.obtener_codigo_login_temporal("codigo-buscado").id == creado.id


def test_obtener_codigo_login_temporal_inexistente_devuelve_none():
    assert repository.obtener_codigo_login_temporal("codigo-no-existe") is None


# ------------------------------------------------------------------
# marcar_codigo_login_temporal_usado
# ------------------------------------------------------------------


def test_marcar_codigo_login_temporal_usado_lo_marca():
    usuario = _usuario()
    codigo = repository.crear_codigo_login_temporal(usuario.id, "codigo-a-usar", _expiracion_codigo())

    repository.marcar_codigo_login_temporal_usado(codigo.id)

    actualizado = repository.obtener_codigo_login_temporal("codigo-a-usar")
    assert actualizado.usado is True


def test_marcar_codigo_login_temporal_usado_de_codigo_inexistente_no_falla():
    # No-op silencioso, mismo contrato que revocar().
    repository.marcar_codigo_login_temporal_usado("00000000-0000-0000-0000-000000000000")
