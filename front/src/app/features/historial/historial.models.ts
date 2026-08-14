// Forma del evento que devuelve `GET /api/historial/` (Django Ninja, ver
// back/historial/controller.py y back/historial/schemas.py en el worktree
// `feature/backend/historial` -- ese módulo del backend TODAVÍA no está
// mezclado en `develop`, así que no existe en este checkout; el contrato
// exacto de campos viene de la especificación de la tarea, verificada 1:1
// contra `historial/schemas.py` de ese worktree, no adivinada).
//
// Igual que en `features/comunidad`, `features/reservas` y el resto de
// features de solo lectura: las interfaces se consumen tal cual dentro de
// la propia feature, sin capa pública que esconder detrás de un mapeo, así
// que se mantiene el nombre de campo exacto que viaja por HTTP (snake_case).
//
// Nota de alcance -- RF27/RF28: esta feature es ESTRICTAMENTE DE SOLO
// LECTURA (un solo endpoint GET en todo el contrato, ver historial.service.ts
// para la nota completa). No hay ningún `EventoHistorialInput`: el historial
// nace de las transiciones de otros módulos (llaves, prestamos), nunca se
// crea ni se edita desde esta UI.

export interface ErrorDetalleDto {
  detail: string;
}

export type TipoRecurso = 'llave' | 'equipo';
export type TipoEvento = 'entrega' | 'devolucion';

/**
 * Un evento de historial (RF27: historial de entregas/devoluciones de
 * llaves y equipos).
 *
 * Fila HETEROGÉNEA: qué campos vienen poblados depende de `tipo_recurso`
 * (ver historial-list.component.ts para cómo se renderiza cada caso):
 *
 * - `tipo_recurso === 'llave'`: `llave_id`, `salon_id`, `docente_titular_id`
 *   y `reclamado_por_id` poblados; `prestamo_id`, `solicitante_id` y
 *   `equipo_ids` siempre `null`.
 * - `tipo_recurso === 'equipo'`: `prestamo_id` y `solicitante_id` poblados;
 *   `llave_id`, `salon_id`, `docente_titular_id` y `reclamado_por_id`
 *   siempre `null`. `equipo_ids` viene poblado SOLO cuando
 *   `tipo_evento === 'entrega'` -- en una `devolucion` de equipo viaja
 *   `null` a propósito: el backend no puede reconstruir qué equipos
 *   puntuales se devolvieron en un evento de devolución dado (ver la nota
 *   de la tarea / historial/service.py del backend).
 *
 * `procesado_por_id` es un `usuario_id` (staff, tabla `usuario`, resuelto
 * vía `HistorialLookupsService.nombreUsuario`), NUNCA un `comunidad_id` --
 * a diferencia de `docente_titular_id`/`reclamado_por_id`/`solicitante_id`,
 * que son `comunidad_id` (personas, tabla `comunidad`, resueltos vía
 * `HistorialLookupsService.nombrePersona`).
 *
 * `fecha_hora` es un instante ISO 8601 CON offset de zona horaria (ej.
 * `"2026-08-13T14:00:00-05:00"`), a diferencia de `fecha`/`hora_inicio` de
 * `reservas` (fechas/horas de CALENDARIO sin zona) -- por eso acá sí es
 * seguro pasarla directo al `DatePipe` de Angular.
 *
 * La lista ya llega ordenada por `fecha_hora` DESCENDENTE desde el backend
 * (más reciente primero): esta feature NUNCA reordena client-side.
 */
export interface EventoHistorial {
  tipo_recurso: TipoRecurso;
  tipo_evento: TipoEvento;
  procesado_por_id: string;
  fecha_hora: string;
  llave_id: string | null;
  salon_id: string | null;
  docente_titular_id: string | null;
  reclamado_por_id: string | null;
  prestamo_id: string | null;
  solicitante_id: string | null;
  equipo_ids: string[] | null;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// Ninguna FK de `EventoHistorial` viaja con nombre denormalizado: la feature
// resuelve cada id a un nombre legible consultando los endpoints de los
// módulos dueños (mismo criterio que `reservas`/`monitores`/`novedades`).
// Cada tipo declara solo los campos que esta feature realmente renderiza --
// no la forma completa del `*Out` del backend.

// `UsuarioOut` de back/usuarios/controller.py: quien PROCESÓ el evento
// (staff). Solo se trae `id` y `nombre`.
export interface UsuarioLookup {
  id: string;
  nombre: string;
}

// `ComunidadOut` de back/comunidad/controller.py: docente titular,
// reclamado-por o solicitante (personas de la comunidad universitaria).
export interface PersonaLookup {
  id: string;
  nombre: string;
}

// `SalonOut` de back/catalogos/controller.py: el salón de un evento de
// llave.
export interface SalonLookup {
  id: string;
  nombre: string;
}

// `EquipoOut` de back/equipos/controller.py: cada equipo de una entrega de
// préstamo.
export interface EquipoLookup {
  id: string;
  nombre: string;
}
