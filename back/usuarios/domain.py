"""
domain.py — lógica de negocio pura del módulo usuarios (sin DB, sin I/O).

Revisado contra el análisis de negocio del sistema legacy
(AulaSync/analisis/backend/usuarios.md, §5 "Puntos de inflexión"): de
todo lo que hacía `usuario.service.js` en el legacy (hash de password,
sesiones/refresh tokens, cambio de contraseña, vinculación por
`numero_documento`, rate limiting), la única regla que sigue aplicando
al DDL nuevo es la autoprotección de desactivación — el resto depende de
columnas que el DDL nuevo no tiene (login local reemplazado por Office
365, ver model.py) o de módulos que no existen todavía (`comunidad`).

- **Autoprotección de desactivación**: un usuario no puede desactivarse a
  sí mismo (legacy: `usuario.service.js:80-82`). Es una decisión pura —
  compara dos ids, sin tocar la base de datos — candidata perfecta para
  vivir acá y no en repository/service. `service.desactivar_usuario` la
  invoca antes de llamar al repository.

No se modela nada más acá (ni máquina de estados de `rol`, ni validación
de `email_institucional`/`oid_microsoft`): esos ya quedan garantizados
por constraints de la base de datos (UNIQUE, NOT NULL, FK) o no tienen
lógica de negocio no trivial que testear de forma aislada.
"""


class AutodesactivacionError(ValueError):
    """Se lanza cuando un usuario intenta desactivarse a sí mismo.

    Hereda de ValueError (no de Exception a secas) para poder reutilizar
    el mismo `except ValueError` que ya usa el resto de controllers del
    proyecto (ver catalogos.controller.crear_salon) sin necesitar un
    manejo especial por tipo de excepción.
    """


def validar_desactivacion(usuario_objetivo_id, usuario_actual_id) -> None:
    """Autoprotección de desactivación: un usuario no puede desactivarse
    a sí mismo.

    Compara los ids por valor (str), no por tipo, porque llegan de
    fuentes distintas según quién llame — un UUID del ORM o un str de un
    payload HTTP/JWT — y ambas formas del mismo id deben reconocerse
    como "el mismo usuario".

    No hace I/O: quién es el "usuario actual" ya viene resuelto por la
    capa de arriba (el futuro módulo `auth`, a partir del JWT de la
    sesión); esta función solo decide si la desactivación está permitida
    dados esos dos ids. Lanza AutodesactivacionError si no lo está.
    """
    if str(usuario_objetivo_id) == str(usuario_actual_id):
        raise AutodesactivacionError("Un usuario no puede desactivarse a sí mismo")
