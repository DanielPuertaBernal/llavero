// Formas de request/response de los endpoints `/api/notificaciones/*` (Django
// Ninja, ver back/notificaciones/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `NotificacionOut`,
// `NotificacionManualIn` y `RecordatorioIn` del controller (no adivinados), y
// el prefijo `/notificaciones` esperado en `api.add_router("/notificaciones",
// ...)` de back/config/urls.py (mismo patrón que el resto de features).
//
// Igual que en `features/reservas`, `features/prestamos` y
// `features/llaves`: las interfaces se consumen tal cual dentro de la propia
// feature, sin capa pública que esconder detrás de un mapeo, así que se
// mantiene el nombre de campo exacto que viaja por HTTP (snake_case) en vez
// de duplicar cada forma en una versión camelCase sin necesidad real.
//
// Nota de alcance — `Notificacion` NO es un CRUD ni un ciclo de vida propio:
// no hay `PATCH`, no hay `DELETE`, y a diferencia de `reservas`/`prestamos`
// tampoco hay una transición de estado que el operador dispare sobre una fila
// existente (`estado_envio` lo decide el backend según si el envío SMTP tuvo
// éxito, nunca el cliente — ver back/notificaciones/service.py). Cada acción
// de esta feature CREA una fila nueva; ninguna edita una existente.
//
// Nota de alcance — `prestamo_id`/`llave_id`/`numero_intento`/`fecha_hora` de
// `Notificacion` (modelo backend) NO aparecen acá: son metadata de
// correlación que pueblan otros flujos automáticos (recordatorios
// disparados por el futuro scheduler, ver back/notificaciones/service.py,
// sección "FUERA DE ALCANCE"), no algo que esta feature de administración
// lea ni escriba. Se omiten del tipo en vez de declararlos `| undefined` sin
// uso real.
//
// Nota de duplicación deliberada — `ErrorDetalleDto` y `PersonaLookup` se
// declaran acá aunque formas idénticas ya existan en `features/reservas` y
// `features/prestamos`: la regla dura del proyecto (ver front/README.md) es
// que ninguna feature importa código de otra feature, solo de `core/`.
// Consumir el endpoint HTTP `GET /api/comunidad/` de otro módulo del backend
// sí está permitido (es una API pública); importar el TypeScript de
// `features/reservas` no.

export interface ErrorDetalleDto {
  detail: string;
}

// Valores exactos de `TipoNotificacion`/`EstadoEnvioNotificacion`
// (`models.TextChoices` en back/notificaciones/model.py). Unión de literales
// de string, no `enum` de TypeScript: lo que viaja por HTTP es el string
// crudo, y la unión da el mismo chequeo en compilación sin un objeto en
// runtime — mismo criterio que `EstadoReserva` en `features/reservas`.
export type TipoNotificacion = 'recordatorio' | 'vencimiento' | 'manual';

export type EstadoEnvioNotificacion = 'enviado' | 'fallido';

// Etiquetas para la UI: las mismas del segundo elemento de cada
// `TextChoices` del backend, no traducciones inventadas acá.
export const ETIQUETAS_TIPO_NOTIFICACION: Record<TipoNotificacion, string> = {
  recordatorio: 'Recordatorio',
  vencimiento: 'Vencimiento',
  manual: 'Manual',
};

export const ETIQUETAS_ESTADO_ENVIO: Record<EstadoEnvioNotificacion, string> = {
  enviado: 'Enviado',
  fallido: 'Fallido',
};

/**
 * Forma que consume `p-select` de PrimeNG (`optionLabel="label"`,
 * `optionValue="value"`). Se deriva de los mapas de etiquetas de arriba en
 * vez de escribirse a mano, mismo patrón que `OPCIONES_ESTADO_RESERVA` en
 * `features/reservas`.
 */
export interface OpcionSelect<T extends string> {
  label: string;
  value: T;
}

function opcionesDesdeEtiquetas<T extends string>(etiquetas: Record<T, string>): OpcionSelect<T>[] {
  return (Object.entries(etiquetas) as [T, string][]).map(([value, label]) => ({ label, value }));
}

export const OPCIONES_TIPO_NOTIFICACION = opcionesDesdeEtiquetas(ETIQUETAS_TIPO_NOTIFICACION);
export const OPCIONES_ESTADO_ENVIO = opcionesDesdeEtiquetas(ETIQUETAS_ESTADO_ENVIO);

/**
 * `NotificacionOut` del controller. `asunto`/`mensaje` son `str | None`: el
 * DDL los declara sin `NOT NULL` (ver la nota de diseño de
 * back/notificaciones/model.py), y en la práctica solo `tipo='manual'` los
 * puebla siempre los dos — `'recordatorio'`/`'vencimiento'` nunca traen
 * `asunto` (no hay concepto de asunto en un correo automático de este
 * dominio, ver `_intentar_envio` en back/notificaciones/service.py, que
 * siempre les pasa `asunto=None`).
 *
 * `enviado_por_id` es `str | null`: viene poblado en `'manual'` (quien
 * disparó el mensaje) y siempre `null` en `'recordatorio'`/`'vencimiento'`
 * (no hay una persona de staff detrás de un envío automático).
 */
export interface Notificacion {
  id: string;
  destinatario_id: string;
  tipo: TipoNotificacion;
  asunto: string | null;
  mensaje: string | null;
  estado_envio: EstadoEnvioNotificacion;
  enviado_por_id: string | null;
}

/**
 * `NotificacionManualIn` del controller: el cuerpo de `POST
 * /api/notificaciones/manual`. Los 4 campos son requeridos (a diferencia de
 * `RecordatorioIn`, ver `RecordatorioInput` más abajo): es el único endpoint
 * de envío que expone un formulario real de composición libre (asunto +
 * mensaje), así que no tiene sentido dejar ninguno vacío — un asunto o
 * mensaje en blanco no es "sin asunto"/"sin mensaje" en un envío manual, es
 * un error de captura del operador.
 */
export interface NotificacionManualInput {
  destinatario_id: string;
  asunto: string;
  mensaje: string;
  enviado_por_id: string;
}

/**
 * `RecordatorioIn` del controller: el cuerpo de `POST
 * /api/notificaciones/recordatorio`. `mensaje` es OPCIONAL de verdad
 * (`str | None = None` en el schema) — a diferencia de `VencimientoIn`, que
 * exige `mensaje: str` sin default. Ver la nota de diseño de
 * `NotificacionesService.enviarRecordatorio` para por qué esto sí se expone
 * como botón simple en la UI y `/vencimiento` no.
 */
export interface RecordatorioInput {
  destinatario_id: string;
  mensaje?: string;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// `destinatario_id` viaja como UUID crudo, sin nombre denormalizado: la
// feature lo resuelve a un nombre legible consultando `GET /api/comunidad/`,
// mismo patrón que `PersonaLookup` en `features/reservas`. Solo se declaran
// los 3 campos que esta feature realmente usa (id para el `p-select`, nombre
// para la columna de la tabla, numero_documento para desambiguar homónimos
// en el selector), no la forma completa de `ComunidadOut`.
export interface PersonaLookup {
  id: string;
  nombre: string;
  numero_documento: string;
}
