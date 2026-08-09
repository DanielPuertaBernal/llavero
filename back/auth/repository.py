"""
repository.py — única capa del módulo auth que toca el ORM.

Métodos de intención (no wrappers genéricos tipo find/save) para la única
entidad que este módulo posee: sesion_refresh.

"Momento" (el `datetime` de revocación/consulta) siempre lo recibe explícito
desde `service.py` en vez de calcular `timezone.now()` acá adentro: así una
sola operación de negocio (p. ej. "revocar todas por reuso") usa un único
timestamp consistente para todas sus escrituras, y domain.py/service.py
pueden testear con un "ahora" fijo sin depender del reloj real.
"""

from auth.model import CodigoLoginTemporal, SesionRefresh


def crear_sesion(usuario_id, jti: str, fecha_expiracion) -> SesionRefresh:
    return SesionRefresh.objects.create(
        usuario_id=usuario_id, jti=jti, fecha_expiracion=fecha_expiracion
    )


def listar_sesiones_no_revocadas(usuario_id):
    """Sesiones de un usuario que no fueron revocadas explícitamente.

    No filtra por expiración: eso es responsabilidad de
    `domain.sesion_vigente` sobre estos datos (una sesión no revocada puede
    seguir estando expirada). Este filtro barato (columna indexada) es el
    único que vale la pena hacer en la query; el resto es lógica pura.
    """
    return list(SesionRefresh.objects.filter(usuario_id=usuario_id, fecha_revocacion__isnull=True))


def obtener_por_jti(jti: str):
    return SesionRefresh.objects.filter(jti=jti).first()


def revocar(sesion_id, momento) -> None:
    """Marca una sesión como revocada. No falla si `sesion_id` no existe
    (no-op) — mismo contrato "silencioso" que usa `service.cerrar_sesion`
    para que un logout con un token ya inválido no sea un error."""
    SesionRefresh.objects.filter(id=sesion_id).update(fecha_revocacion=momento)


def revocar_todas_las_del_usuario(usuario_id, momento) -> None:
    """Revoca todas las sesiones no revocadas de un usuario — detección de
    reuso (ver domain.es_intento_de_reuso) o cualquier otro caso futuro que
    necesite forzar re-login completo."""
    SesionRefresh.objects.filter(usuario_id=usuario_id, fecha_revocacion__isnull=True).update(
        fecha_revocacion=momento
    )


# ------------------------------------------------------------------
# CodigoLoginTemporal
# ------------------------------------------------------------------


def crear_codigo_login_temporal(usuario_id, codigo: str, fecha_expiracion) -> CodigoLoginTemporal:
    return CodigoLoginTemporal.objects.create(
        usuario_id=usuario_id, codigo=codigo, fecha_expiracion=fecha_expiracion
    )


def obtener_codigo_login_temporal(codigo: str):
    return CodigoLoginTemporal.objects.filter(codigo=codigo).first()


def marcar_codigo_login_temporal_usado(codigo_id) -> None:
    """No falla si `codigo_id` no existe (no-op) — mismo contrato silencioso
    que usa `revocar` sobre sesion_refresh."""
    CodigoLoginTemporal.objects.filter(id=codigo_id).update(usado=True)
