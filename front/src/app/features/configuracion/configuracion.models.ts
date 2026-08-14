// Formas de request/response de `/api/configuracion/*` (Django Ninja, ver
// back/configuracion/controller.py) consumidas por esta feature — nombres de
// campo verificados 1:1 contra `ConfiguracionOut`/`ConfiguracionIn` del
// controller (no adivinados).
//
// Igual que en el resto de features: las interfaces se consumen tal cual
// dentro de la propia feature, sin capa pública que esconder detrás de un
// mapeo, así que se mantiene el nombre de campo exacto que viaja por HTTP
// (snake_case).
//
// Nota de alcance — esta es una feature SINGLETON, no una colección: el
// backend solo expone `GET /api/configuracion/` (get-or-create, nunca 404) y
// `PUT /api/configuracion/` (reemplazo completo). También existe
// `POST /api/configuracion/` en el controller, pero NO se modela acá a
// propósito: el GET ya crea la fila si no existe, así que para cuando un
// operador abre esta pantalla la fila siempre existe — no hay caso de uso
// legítimo para crear una segunda configuración desde esta UI.

export interface ErrorDetalleDto {
  detail: string;
}

/** `ConfiguracionOut` del controller. */
export interface Configuracion {
  id: string;
  limite_antes_mora_minutos: number;
  max_reintentos_recordatorio: number;
  plantilla_recordatorio: string | null;
  ubicacion_defecto_id: string;
  limite_no_reclamada_minutos: number;
}

/**
 * `ConfiguracionIn` del controller: el cuerpo de `PUT /api/configuracion/`.
 * Reemplazo completo (no parcial) — el formulario manda siempre los 5 campos,
 * a diferencia del `PATCH` parcial de `usuarios`.
 */
export interface ConfiguracionInput {
  ubicacion_defecto_id: string;
  limite_antes_mora_minutos: number;
  max_reintentos_recordatorio: number;
  plantilla_recordatorio: string | null;
  limite_no_reclamada_minutos: number;
}

// ------------------------------------------------------------------
// Lookup
// ------------------------------------------------------------------

/**
 * `UbicacionOut` de back/catalogos/controller.py. Los 3 flags de permiso NO
 * se traen: esta feature solo necesita el NOMBRE de la ubicación para el
 * selector de ubicación por defecto — ningún permiso de préstamo/devolución
 * condiciona esa elección.
 */
export interface UbicacionLookup {
  id: string;
  nombre: string;
}
