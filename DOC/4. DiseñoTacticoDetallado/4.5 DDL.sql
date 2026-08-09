-- ============================================================
-- Llavero — DDL PostgreSQL
-- Corresponde a: 4.1 Modelo de Datos.md / 2.1 Modelo Dominio Anémico.md
-- ============================================================

-- El UUID de cada PK lo genera el backend (Django: UUIDField(default=uuid.uuid4)) antes del INSERT,
-- no la base de datos. No se requiere pgcrypto ni gen_random_uuid().

-- ============================================================
-- ENUMS — estados y tipos cerrados que NO se normalizaron
-- como tabla aparte (Rol y TipoPersona sí son tabla, ver abajo)
-- ============================================================

CREATE TYPE dia_semana AS ENUM
    ('lunes','martes','miercoles','jueves','viernes','sabado','domingo');

CREATE TYPE estado_reserva_individual AS ENUM
    ('aprobada','cancelada','completada','no_reclamada');

CREATE TYPE estado_llave AS ENUM
    ('en_prestamo','demora_entrega','entregado');

CREATE TYPE origen_llave AS ENUM
    ('programacion','reserva_semestral','reserva_individual','manual');

CREATE TYPE tipo_entrega_llave AS ENUM
    ('credencial','manual');

CREATE TYPE estado_equipo_tipo AS ENUM
    ('activo','inactivo');

CREATE TYPE estado_prestamo AS ENUM
    ('activo','parcialmente_devuelto','completamente_devuelto');

CREATE TYPE estado_detalle_equipo AS ENUM
    ('entregado','devuelto');

CREATE TYPE categoria_novedad AS ENUM
    ('dano','perdida','otro');

CREATE TYPE estado_novedad AS ENUM
    ('abierta','cerrada');

CREATE TYPE tipo_notificacion AS ENUM
    ('recordatorio','vencimiento','manual');

CREATE TYPE estado_envio_notificacion AS ENUM
    ('enviado','fallido');

-- ============================================================
-- Catálogos (Identidad)
-- ============================================================

CREATE TABLE rol (
    id      UUID PRIMARY KEY,
    nombre  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE tipo_persona (
    id      UUID PRIMARY KEY,
    nombre  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE ubicacion (
    id                          UUID PRIMARY KEY,
    nombre                      VARCHAR(100) NOT NULL,
    permite_prestamo_llaves     BOOLEAN NOT NULL DEFAULT true,
    permite_devolucion_llaves   BOOLEAN NOT NULL DEFAULT true,
    permite_prestamo_equipos    BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================
-- Catálogos (Espacios)
-- ============================================================

CREATE TABLE bloque (
    id      UUID PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE tipo_silleteria (
    id      UUID PRIMARY KEY,
    nombre  VARCHAR(50) NOT NULL UNIQUE
);

-- ============================================================
-- Identidad
-- ============================================================

CREATE TABLE usuario (
    id                    UUID PRIMARY KEY,
    nombre                VARCHAR(150) NOT NULL,
    email_institucional   VARCHAR(150) NOT NULL UNIQUE,
    oid_microsoft         VARCHAR(100) UNIQUE,
    rol_id                UUID NOT NULL REFERENCES rol(id),
    ubicacion_id          UUID NOT NULL REFERENCES ubicacion(id),
    activo                BOOLEAN NOT NULL DEFAULT true
);

-- Sesiones de refresh token (módulo auth). No hay tabla de usuarios con
-- password/username local (login vía Office 365) — este es el propio
-- mecanismo de rotación/revocación/detección de reuso de refresh tokens
-- del backend, portado del sistema legacy (JWT access+refresh propios,
-- ver AulaSync/analisis/backend/auth.md). No se usa el AUTH_USER_MODEL
-- de Django ni el blacklist app acoplado a él, porque eso exigiría
-- convertir `usuario` en un modelo Django de auth (AbstractBaseUser),
-- algo que el DDL de `usuario` no necesita ni debe cargar.
CREATE TABLE sesion_refresh (
    id            UUID PRIMARY KEY,
    usuario_id    UUID NOT NULL REFERENCES usuario(id),
    jti           VARCHAR(64) NOT NULL UNIQUE,
    fecha_emision   TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion   TIMESTAMPTZ NOT NULL,
    fecha_revocacion   TIMESTAMPTZ,
    CHECK (fecha_revocacion IS NULL OR fecha_revocacion >= fecha_emision)
);
CREATE INDEX idx_sesion_refresh_usuario ON sesion_refresh(usuario_id);

-- Código de intercambio de un solo uso (módulo auth), para el flujo
-- Authorization Code con callback en el backend: Microsoft redirige el
-- navegador a /api/auth/callback (no una llamada API que el frontend pueda
-- leer directo), así que el backend no puede devolver los JWT en esa
-- respuesta sin exponerlos en la URL del siguiente redirect (historial del
-- navegador, logs, header Referer). En su lugar, /callback resuelve la
-- identidad y deja un código opaco de un solo uso acá; el frontend, ya en
-- FRONTEND_POST_LOGIN_REDIRECT_URL, lo canjea vía POST /api/auth/exchange
-- para recién ahí recibir el par de JWT en el body de una respuesta JSON.
CREATE TABLE codigo_login_temporal (
    id                 UUID PRIMARY KEY,
    codigo             VARCHAR(64) NOT NULL UNIQUE,
    usuario_id         UUID NOT NULL REFERENCES usuario(id),
    fecha_emision      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion   TIMESTAMPTZ NOT NULL,
    usado              BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_codigo_login_temporal_usuario ON codigo_login_temporal(usuario_id);

CREATE TABLE comunidad (
    id                UUID PRIMARY KEY,
    numero_documento  VARCHAR(20) NOT NULL UNIQUE,
    nombre            VARCHAR(150) NOT NULL,
    tipo_persona_id   UUID NOT NULL REFERENCES tipo_persona(id),
    id_carnet         VARCHAR(15),
    correo            VARCHAR(150),
    numero_contacto   VARCHAR(30),
    facultad          VARCHAR(100)
);

CREATE UNIQUE INDEX idx_comunidad_id_carnet
    ON comunidad(id_carnet) WHERE id_carnet IS NOT NULL;

-- ============================================================
-- Espacios
-- ============================================================

CREATE TABLE salon (
    id                   UUID PRIMARY KEY,
    nombre               VARCHAR(30) NOT NULL,
    bloque_id            UUID NOT NULL REFERENCES bloque(id),
    tipo_silleteria_id   UUID NOT NULL REFERENCES tipo_silleteria(id),
    cantidad_sillas      INT NOT NULL DEFAULT 0,
    cantidad_mesas       INT NOT NULL DEFAULT 0,
    UNIQUE (nombre, bloque_id)
);

CREATE TABLE semestre (
    id             UUID PRIMARY KEY,
    codigo         VARCHAR(10) NOT NULL UNIQUE,
    fecha_inicio   DATE NOT NULL,
    fecha_fin      DATE NOT NULL,
    CHECK (fecha_inicio < fecha_fin)
);

-- ============================================================
-- Disponibilidad
-- ============================================================

CREATE TABLE programacion (
    id            UUID PRIMARY KEY,
    salon_id      UUID NOT NULL REFERENCES salon(id),
    docente_id    UUID NOT NULL REFERENCES comunidad(id),
    semestre_id   UUID NOT NULL REFERENCES semestre(id),
    dia           dia_semana NOT NULL,
    hora_inicio   TIME NOT NULL,
    hora_fin      TIME NOT NULL,
    materia       VARCHAR(150) NOT NULL,
    CHECK (hora_inicio < hora_fin)
);
CREATE INDEX idx_programacion_salon_dia ON programacion(salon_id, dia);

CREATE TABLE reserva_semestral (
    id                   UUID PRIMARY KEY,
    salon_id             UUID NOT NULL REFERENCES salon(id),
    solicitante_id       UUID NOT NULL REFERENCES comunidad(id),
    semestre_id          UUID NOT NULL REFERENCES semestre(id),
    dia                  dia_semana NOT NULL,
    hora_inicio          TIME NOT NULL,
    hora_fin             TIME NOT NULL,
    grupo_id             UUID NOT NULL,
    creado_manualmente   BOOLEAN NOT NULL DEFAULT true,
    CHECK (hora_inicio < hora_fin)
);
CREATE INDEX idx_reserva_semestral_salon_dia ON reserva_semestral(salon_id, dia);
CREATE INDEX idx_reserva_semestral_grupo ON reserva_semestral(grupo_id);

CREATE TABLE reserva_individual (
    id               UUID PRIMARY KEY,
    salon_id         UUID NOT NULL REFERENCES salon(id),
    solicitante_id   UUID NOT NULL REFERENCES comunidad(id),
    fecha            DATE NOT NULL,
    hora_inicio      TIME NOT NULL,
    hora_fin         TIME NOT NULL,
    motivo           VARCHAR(255),
    estado           estado_reserva_individual NOT NULL DEFAULT 'aprobada',
    CHECK (hora_inicio < hora_fin)
);
CREATE INDEX idx_reserva_individual_salon_fecha ON reserva_individual(salon_id, fecha);

-- ============================================================
-- Novedad (antes de Llave/DetallePrestamo por el FK que reciben)
-- ============================================================

CREATE TABLE novedad (
    id                  UUID PRIMARY KEY,
    categoria           categoria_novedad NOT NULL,
    descripcion         TEXT,
    estado              estado_novedad NOT NULL DEFAULT 'abierta',
    solucion            TEXT,
    registrado_por_id   UUID NOT NULL REFERENCES usuario(id)
);

-- ============================================================
-- Llaves
-- ============================================================

CREATE TABLE llave (
    id                        UUID PRIMARY KEY,
    salon_id                  UUID NOT NULL REFERENCES salon(id),
    docente_titular_id        UUID NOT NULL REFERENCES comunidad(id),
    reclamado_por_id          UUID NOT NULL REFERENCES comunidad(id),
    origen                    origen_llave NOT NULL,
    tipo_entrega               tipo_entrega_llave NOT NULL,
    tipo_devolucion            tipo_entrega_llave,
    usuario_entrega_id        UUID NOT NULL REFERENCES usuario(id),
    usuario_recibe_id         UUID REFERENCES usuario(id),
    ubicacion_entrega_id      UUID NOT NULL REFERENCES ubicacion(id),
    ubicacion_devolucion_id   UUID REFERENCES ubicacion(id),
    novedad_id                UUID REFERENCES novedad(id),
    fecha_hora_entrega        TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_hora_devolucion     TIMESTAMPTZ,
    estado                    estado_llave NOT NULL DEFAULT 'en_prestamo',
    CHECK (fecha_hora_devolucion IS NULL OR fecha_hora_devolucion > fecha_hora_entrega)
);

CREATE INDEX idx_llave_docente_titular ON llave(docente_titular_id);
CREATE INDEX idx_llave_estado ON llave(estado);

-- Regla de negocio real (RNF02): no puede haber dos llaves activas
-- del mismo salón al mismo tiempo — esto es lo que evita el doble
-- préstamo concurrente que motivó parte de esta migración.
CREATE UNIQUE INDEX idx_llave_activa_unica_por_salon
    ON llave(salon_id) WHERE estado != 'entregado';

-- ============================================================
-- Equipos
-- ============================================================

CREATE TABLE equipo (
    id                  UUID PRIMARY KEY,
    nombre              VARCHAR(150) NOT NULL,
    marca               VARCHAR(100),
    codigo_inventario   VARCHAR(50) NOT NULL UNIQUE,
    codigo_barras       VARCHAR(50) UNIQUE,
    estado              estado_equipo_tipo NOT NULL DEFAULT 'activo'
);

CREATE TABLE prestamo (
    id                        UUID PRIMARY KEY,
    solicitante_id            UUID NOT NULL REFERENCES comunidad(id),
    usuario_prestamista_id    UUID NOT NULL REFERENCES usuario(id),
    ubicacion_id              UUID NOT NULL REFERENCES ubicacion(id),
    estado                    estado_prestamo NOT NULL DEFAULT 'activo',
    fecha_creacion            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prestamo_estado ON prestamo(estado);
CREATE INDEX idx_prestamo_solicitante ON prestamo(solicitante_id);

CREATE TABLE detalle_prestamo (
    id                 UUID PRIMARY KEY,
    prestamo_id        UUID NOT NULL REFERENCES prestamo(id) ON DELETE CASCADE,
    equipo_id          UUID NOT NULL REFERENCES equipo(id),
    novedad_id         UUID REFERENCES novedad(id),
    estado_equipo      estado_detalle_equipo NOT NULL DEFAULT 'entregado',
    fecha_entrega      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_devolucion   TIMESTAMPTZ,
    CHECK (fecha_devolucion IS NULL OR fecha_devolucion > fecha_entrega)
);

-- Mismo principio que en llave: un equipo no puede estar "entregado"
-- en dos préstamos activos a la vez.
CREATE UNIQUE INDEX idx_equipo_entregado_unico
    ON detalle_prestamo(equipo_id) WHERE estado_equipo = 'entregado';

CREATE TABLE devolucion (
    id                  UUID PRIMARY KEY,
    prestamo_id         UUID NOT NULL REFERENCES prestamo(id),
    usuario_recibe_id   UUID NOT NULL REFERENCES usuario(id),
    ubicacion_id        UUID NOT NULL REFERENCES ubicacion(id),
    fecha               TIMESTAMPTZ NOT NULL DEFAULT now(),
    es_completa         BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================
-- Soporte
-- ============================================================

CREATE TABLE monitor (
    id                     UUID PRIMARY KEY,
    docente_titular_id     UUID NOT NULL REFERENCES comunidad(id),
    monitor_delegado_id    UUID NOT NULL REFERENCES comunidad(id),
    materia                VARCHAR(150) NOT NULL,
    aula                   VARCHAR(30),
    dia                    dia_semana,
    horario                VARCHAR(30),
    activo                 BOOLEAN NOT NULL DEFAULT true,
    CHECK (docente_titular_id != monitor_delegado_id)
);

CREATE TABLE notificacion (
    id                UUID PRIMARY KEY,
    destinatario_id   UUID NOT NULL REFERENCES comunidad(id),
    tipo              tipo_notificacion NOT NULL,
    asunto            VARCHAR(200),
    mensaje           TEXT,
    estado_envio      estado_envio_notificacion NOT NULL DEFAULT 'enviado',
    enviado_por_id    UUID REFERENCES usuario(id),
    prestamo_id       UUID REFERENCES prestamo(id),
    numero_intento    INT,
    fecha_hora        TIMESTAMPTZ
);

CREATE TABLE configuracion (
    id                             UUID PRIMARY KEY,
    limite_antes_mora_minutos      INT NOT NULL DEFAULT 120,
    max_reintentos_recordatorio    INT NOT NULL DEFAULT 3,
    plantilla_recordatorio         TEXT,
    ubicacion_defecto_id           UUID NOT NULL REFERENCES ubicacion(id)
);

-- ============================================================
-- INSERTS básicos — estados y tipos cerrados
-- (Rol y TipoPersona: catálogos reales, no enum, por eso necesitan
-- filas; Ubicación se siembra también porque sin al menos una fila
-- no se puede crear ni un Usuario, dado que ubicacion_id es NOT NULL)
-- ============================================================

INSERT INTO rol (nombre) VALUES
    ('admin'),
    ('auxiliar'),
    ('portero');

INSERT INTO tipo_persona (nombre) VALUES
    ('docente'),
    ('estudiante'),
    ('empleado');

INSERT INTO ubicacion (nombre, permite_prestamo_llaves, permite_devolucion_llaves, permite_prestamo_equipos) VALUES
    ('Oficina principal',   true, true, true),
    ('Portería superior',   true, true, false),
    ('Portería inferior',   true, true, false);
