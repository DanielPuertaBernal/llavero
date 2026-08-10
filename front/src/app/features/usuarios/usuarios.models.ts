// Formas de request/response de los endpoints `/api/usuarios/*` (Django
// Ninja, ver back/usuarios/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `UsuarioOut`/
// `UsuarioIn`/`DesactivarUsuarioIn` del controller (no adivinados).
//
// Igual que en `features/catalogos`, `features/llaves` y
// `features/prestamos`: las interfaces se consumen tal cual dentro de la
// propia feature, sin capa pública que esconder detrás de un mapeo, así que
// se mantiene el nombre de campo exacto que viaja por HTTP (snake_case).
//
// Nota deliberada — `core/auth` SÍ expone camelCase (`UsuarioAutenticado`,
// ver core/auth/auth.models.ts) porque ahí el mapeo es parte del contrato
// público de `AuthService` hacia toda la app. Esta feature inyecta ese
// servicio para saber QUIÉN está operando, pero esa convención NO se
// contagia a los modelos de acá: lo que se manda y se recibe por
// `/api/usuarios/*` sigue siendo snake_case.
//
// Nota de alcance — `Usuario` sigue sin ser un CRUD completo: el backend
// expone `GET /`, `GET /{id}`, `POST /`, `POST /vincular-oid-microsoft`,
// `PATCH /{id}`, `POST /{id}/desactivar` y `POST /{id}/reactivar` (ver
// back/usuarios/controller.py). NO hay DELETE. Consecuencias que esta
// feature respeta:
//
// 1. Un usuario SÍ se edita (`PATCH /{id}`, cuerpo parcial), pero solo en
//    sus 4 campos de datos — ver `UsuarioPatchInput` más abajo.
// 2. El ESTADO (`activo`) no se toca por PATCH: tiene sus propias
//    transiciones explícitas, `desactivar` y `reactivar`. Ambas existen, así
//    que la desactivación ya no es de una sola dirección y el diálogo de
//    confirmación lo dice así.
// 3. Un usuario nunca se borra: darlo de baja es desactivarlo, y su
//    historial de préstamos sigue siendo referenciable.
//
// Nota de alcance — `POST /vincular-oid-microsoft` NO se modela acá a
// propósito: es un paso del login federado de Office 365 (el backend
// vincula el `oid` de Microsoft a un Usuario precreado en su primer
// ingreso, ver back/usuarios/service.py), no una acción de administración.
// La columna "Vinculado a Microsoft" de la tabla solo REPORTA el resultado
// de ese flujo leyendo `oid_microsoft`; nunca lo dispara.
//
// Nota de duplicación deliberada — `ErrorDetalleDto` y los tipos de lookup
// (`RolLookup`, `UbicacionLookup`) se declaran acá aunque formas parecidas
// ya existan en las otras features: la regla dura del proyecto (ver
// front/README.md y DOC/4.3 Diagrama de Paquetes.md) es que ninguna feature
// importa código de otra feature, solo de `core/`. Consumir el endpoint
// HTTP de otro módulo del backend sí está permitido (es una API pública);
// importar el TypeScript de otra feature no.

export interface ErrorDetalleDto {
  detail: string;
}

/**
 * `UsuarioOut` del controller. `oid_microsoft` es `null` mientras la
 * persona no haya entrado nunca por Office 365: el admin precrea el
 * usuario y el primer login lo vincula (ver la nota de alcance arriba).
 */
export interface Usuario {
  id: string;
  nombre: string;
  email_institucional: string;
  oid_microsoft: string | null;
  rol_id: string;
  ubicacion_id: string;
  activo: boolean;
}

/**
 * `UsuarioIn` del controller: el cuerpo de `POST /api/usuarios/`. `id` y
 * `oid_microsoft` NO se envían — el primero lo genera el backend y el
 * segundo lo fija el login federado. `activo` tiene default `True` en el
 * schema; el formulario lo manda siempre explícito para que el payload
 * diga exactamente lo que el operador marcó.
 */
export interface UsuarioInput {
  nombre: string;
  email_institucional: string;
  rol_id: string;
  ubicacion_id: string;
  activo: boolean;
}

/**
 * `UsuarioPatch` del controller: el cuerpo de `PATCH /api/usuarios/{id}`.
 * Todos los campos son opcionales y el backend aplica SOLO los que llegan
 * (`exclude_unset`), así que el tipo es una parcial de verdad, no un
 * `UsuarioInput` con campos nullables.
 *
 * Nota deliberada — `activo` NO está acá, y no es un olvido: el backend lo
 * excluye del schema a propósito. El estado de un usuario se cambia con
 * `POST /{id}/desactivar` y `POST /{id}/reactivar`, que son transiciones
 * explícitas y auditables (la primera incluso aplica la autoprotección de
 * "nadie se desactiva a sí mismo"). Colar `activo` en un PATCH sería
 * saltarse esa regla por la puerta de atrás, así que el tipo lo hace
 * imposible de expresar en vez de confiar en que nadie lo mande.
 *
 * Por eso tampoco se define como `Partial<UsuarioInput>`: ese alias SÍ
 * incluiría `activo`, y el error se detectaría recién en tiempo de
 * ejecución (o ni eso, porque el backend lo ignoraría en silencio).
 */
export interface UsuarioPatchInput {
  nombre?: string;
  email_institucional?: string;
  rol_id?: string;
  ubicacion_id?: string;
}

/**
 * Variables de `POST /api/usuarios/{id}/desactivar`. `id` identifica al
 * usuario OBJETIVO y viaja en la URL; `usuario_actual_id` es el cuerpo
 * completo (`DesactivarUsuarioIn`) e identifica a QUIEN ejecuta la acción.
 *
 * El backend usa ese par para su regla de autoprotección
 * (`domain.validar_desactivacion`): un usuario no puede desactivarse a sí
 * mismo. `AutodesactivacionError` extiende `ValueError`, así que el
 * controller responde 400 con su mensaje — que se muestra tal cual.
 */
export interface DesactivacionVariables {
  id: string;
  usuario_actual_id: string;
}

/**
 * Filtro de estado de la vista de lista. A diferencia de `llaves` y
 * `prestamos`, acá NO hay un endpoint `GET /estado/{estado}`: es un filtro
 * de cliente sobre la lista ya descargada (ver el docblock de
 * `UsuariosListComponent`).
 */
export type FiltroEstadoUsuario = 'todos' | 'activos' | 'inactivos';

/** Forma que consume `p-select` de PrimeNG (`optionLabel`/`optionValue`). */
export interface OpcionSelect<T> {
  label: string;
  value: T;
}

export const OPCIONES_FILTRO_ESTADO_USUARIO: OpcionSelect<FiltroEstadoUsuario>[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Activos', value: 'activos' },
  { label: 'Inactivos', value: 'inactivos' },
];

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// `UsuarioOut` devuelve `rol_id` y `ubicacion_id` como UUID crudo, sin
// nombres denormalizados: la feature los resuelve consultando el módulo
// dueño (`catalogos`). Cada tipo declara solo los campos que esta feature
// realmente renderiza — no la forma completa del `*Out` del backend.

/** `RolOut` de back/catalogos/controller.py. */
export interface RolLookup {
  id: string;
  nombre: string;
}

/**
 * `UbicacionOut` de back/catalogos/controller.py. Los 3 flags de permiso NO
 * se traen: esta feature solo muestra el NOMBRE de la ubicación asignada a
 * cada usuario y la ofrece en el selector del formulario — ningún permiso
 * de préstamo/devolución condiciona esas dos cosas.
 */
export interface UbicacionLookup {
  id: string;
  nombre: string;
}
