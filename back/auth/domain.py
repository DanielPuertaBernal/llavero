"""
domain.py — lógica de negocio pura del módulo auth (sin DB, sin I/O).

Portado de AulaSync/analisis/backend/auth.md (§4.2, §5): de la lógica de
sesiones de refresh del legacy, estas son las 3 decisiones puras (dado un
conjunto de datos ya cargado, sin consultar la base de datos) que valen la
pena aislar y testear sin DB:

- **Vigencia de una sesión**: no revocada y no expirada.
- **Detección de reuso**: presentar un refresh token cuya sesión no existe o
  ya fue revocada es indistinguible de un robo/replay — dispara revocar
  TODAS las sesiones del usuario (defensa estándar, ver auth.md §5).
- **Tope de sesiones concurrentes**: qué sesiones (las más antiguas) hay que
  revocar antes de emitir una nueva para no superar el tope.

El resto de auth.md (rate limiting, verificación de contraseña, cálculo de
expiración desde una env var con formato ambiguo) no aplica al DDL nuevo: no
hay password local (Office 365 reemplaza ese paso, ver model.py) y las
duraciones de los tokens quedan fijas en settings (NINJA_JWT), no en un
string a parsear a mano.

Además, la decisión de vigencia de `codigo_login_temporal` (el código opaco
de un solo uso del flujo Authorization Code, ver model.py y
service.procesar_callback_microsoft/intercambiar_codigo_login): mismo tipo de
chequeo puro que `sesion_vigente`, pero con "usado" en vez de "revocado".
"""

TOPE_SESIONES_CONCURRENTES = 5

# Duración de un `codigo_login_temporal`: solo tiene que sobrevivir el tiempo
# de un redirect de navegador (GET /callback -> frontend) más la llamada
# inmediata del frontend a POST /exchange — nada comparable a los 7 días del
# refresh token, que sería una ventana de robo enorme para un código de un
# solo uso pensado para canjearse al instante. 90 segundos da margen holgado
# para ese round-trip sin dejar el código vivo más de lo necesario.
DURACION_CODIGO_LOGIN_TEMPORAL_SEGUNDOS = 90


def sesion_vigente(sesion, ahora) -> bool:
    """Una sesión de refresh está vigente si no fue revocada y no expiró.

    `sesion` es cualquier objeto con `fecha_revocacion`/`fecha_expiracion`
    (una instancia real de SesionRefresh, o un doble de test) — esta función
    no toca la base de datos, solo compara los valores ya cargados.
    """
    if sesion.fecha_revocacion is not None:
        return False
    return sesion.fecha_expiracion > ahora


def es_intento_de_reuso(sesion) -> bool:
    """Decide si presentar este refresh token es un intento de reuso.

    `sesion` es el resultado de buscar por `jti` en `sesion_refresh` (o
    `None` si no existe). Dos casos se tratan igual porque son
    indistinguibles desde la perspectiva de seguridad — alguien presenta un
    refresh token que ya no debería poder usarse:
    - `sesion is None`: el jti no existe (nunca se emitió, o dato corrupto).
    - `sesion.fecha_revocacion is not None`: el token ya fue consumido antes
      (rotación single-use) o cerrado por logout/revocación masiva.

    Ambos disparan la misma respuesta en `service.refrescar_sesion`: revocar
    TODAS las sesiones del usuario, no solo rechazar esta.
    """
    return sesion is None or sesion.fecha_revocacion is not None


def codigo_vigente(codigo, ahora) -> bool:
    """Un `codigo_login_temporal` está vigente si no fue usado y no expiró.

    `codigo` es cualquier objeto con `usado`/`fecha_expiracion` (una
    instancia real de CodigoLoginTemporal, o un doble de test) — igual que
    `sesion_vigente`, no toca la base de datos.
    """
    if codigo.usado:
        return False
    return codigo.fecha_expiracion > ahora


def sesiones_a_revocar_por_tope(sesiones_vigentes, tope: int = TOPE_SESIONES_CONCURRENTES):
    """Decide qué sesiones vigentes revocar (las más antiguas primero) antes
    de emitir una nueva, para no superar el tope de sesiones concurrentes.

    Recibe solo sesiones ya vigentes (ver `sesion_vigente`) — filtrar las
    revocadas/expiradas es responsabilidad de quien llama (`service`), esta
    función no hace I/O ni sabe nada de "ahora". Devuelve la lista (de más
    antigua a más reciente) de sesiones a revocar; vacía si añadir una
    sesión nueva no haría superar el tope.
    """
    if len(sesiones_vigentes) < tope:
        return []
    ordenadas = sorted(sesiones_vigentes, key=lambda s: s.fecha_emision)
    exceso = len(ordenadas) - tope + 1
    return ordenadas[:exceso]
