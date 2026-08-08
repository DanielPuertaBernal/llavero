"""
Modelo ORM del módulo auth.

Este módulo es dueño exclusivo de la tabla `sesion_refresh` (ver DDL en
DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql, comentario junto a la tabla) — el
mecanismo propio de rotación/revocación de refresh tokens JWT, portado del
sistema legacy (AulaSync/analisis/backend/auth.md) sin usar el blacklist app
de `django-ninja-jwt` (`OutstandingToken`/`BlacklistedToken`, ver nota de
diseño en `service.py`).

El UUID de la PK lo genera el backend en Python (default=uuid.uuid4), nunca
la base de datos, igual que el resto de módulos.

Regla dura del proyecto: ningún otro módulo debe importar este modelo
directamente. Otros módulos (cuando exista un futuro consumidor) deben pasar
por `auth.service`.

Nota de diseño — FK a `usuarios.model.Usuario`: mismo patrón cross-módulo que
`usuarios.model.Usuario.rol`/`ubicacion` contra `catalogos.model` — el
`ForeignKey` importa la clase directamente porque el ORM la necesita para
declarar la columna; la regla dura de capas ("auth solo puede consultar
usuarios vía usuarios.service") aplica a la lógica de negocio
(repository/domain/service de este módulo), no a esta relación de Django.

Nota de diseño — `on_delete=CASCADE` (no PROTECT): a diferencia de las FK de
`catalogos`/`usuarios` (donde PROTECT tiene sentido porque borrar un Rol o
Bloque que todavía tiene Usuarios/Salones asociados sería un error de
integridad de negocio que el operador debe resolver a mano), acá no aplica
el mismo razonamiento. `sesion_refresh` no es una entidad de negocio: es
infraestructura de autenticación derivada de un Usuario (ver
`4.1 Modelo de Datos.md`, nota sobre esta tabla). Si un Usuario se borra, sus
sesiones de refresh no tienen ningún sentido de existir por separado —
bloquear el borrado del Usuario (PROTECT) solo porque tiene sesiones activas
sería una fricción operativa sin valor real (a diferencia de bloquear el
borrado de un Rol con Usuarios activos, que sí protege contra un error real).
CASCADE es el comportamiento correcto: borrar el Usuario borra sus sesiones.
"""

import uuid

from django.db import models

from usuarios.model import Usuario


class SesionRefresh(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, db_column="usuario_id")
    jti = models.CharField(max_length=64, unique=True)
    fecha_emision = models.DateTimeField(auto_now_add=True)
    fecha_expiracion = models.DateTimeField()
    fecha_revocacion = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "sesion_refresh"

    def __str__(self) -> str:
        return f"{self.usuario_id}:{self.jti}"


class CodigoLoginTemporal(models.Model):
    """Código opaco de un solo uso para el paso final del flujo Authorization
    Code (ver `auth/service.py`, `procesar_callback_microsoft`/
    `intercambiar_codigo_login`).

    `GET /callback` no puede devolver los JWT directamente: el navegador está
    en medio de un redirect (no puede leer un body JSON), y meter los JWT
    reales en la query string de esa redirección los dejaría flotando en
    historial/logs. En su lugar, `/callback` genera acá un código opaco de
    corta duración y redirige al frontend con `?code=...`; el frontend lo
    canjea de inmediato por los JWT reales en `POST /exchange` (un POST
    normal con body JSON), que es el único punto donde se llama
    `_emitir_par_de_tokens`.

    Misma nota de diseño que `SesionRefresh` sobre `on_delete=CASCADE` (no
    PROTECT): esta tabla tampoco es una entidad de negocio, es infraestructura
    de autenticación derivada de un Usuario — si el Usuario se borra, un
    código de login pendiente de canjear no tiene ningún sentido de existir
    por separado.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=64, unique=True)
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, db_column="usuario_id")
    fecha_emision = models.DateTimeField(auto_now_add=True)
    fecha_expiracion = models.DateTimeField()
    usado = models.BooleanField(default=False)

    class Meta:
        db_table = "codigo_login_temporal"

    def __str__(self) -> str:
        return f"{self.usuario_id}:{self.codigo}"
