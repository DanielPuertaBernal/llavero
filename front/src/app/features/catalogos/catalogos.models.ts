// Formas de request/response de los endpoints `/api/catalogos/*` (Django
// Ninja, ver back/catalogos/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `*Out`/`*In` del
// controller (no adivinados).
//
// A diferencia de `core/auth/auth.models.ts` (que sí mapea DTO snake_case
// -> modelo de dominio camelCase, porque `AuthService` es la API pública de
// `core` para el resto del frontend), estas interfaces se consumen tal cual
// dentro de la propia feature `catalogos`: no hay una capa pública que
// esconder detrás de un mapeo, así que se mantiene el nombre de campo
// exacto que viaja por HTTP (snake_case) en vez de duplicar cada forma en
// una versión camelCase sin necesidad real.
//
// Los 6 catálogos usan UUID (`id`) como única identidad — a diferencia del
// frontend legacy (React), NINGUNA entidad tiene un campo `clave` de
// negocio (ver AulaSync/analisis/frontend/catalogos.md, que sí lo documenta
// para `Ubicacion`: ese concepto no existe en el backend nuevo).
//
// PATCH es partial update en las 4 entidades (el controller usa
// `payload.model_dump(exclude_unset=True)`, ver controller.py) — se modela
// acá como `Partial<...Input>` en vez de una interfaz `*Patch` separada,
// para no duplicar la forma.

export interface ErrorDetalleDto {
  detail: string;
}

export interface Bloque {
  id: string;
  nombre: string;
}

export interface BloqueInput {
  nombre: string;
}

export interface TipoSilleteria {
  id: string;
  nombre: string;
}

export interface TipoSilleteriaInput {
  nombre: string;
}

// `Ubicacion` en el backend nuevo tiene solo 3 flags de permiso — el legacy
// (ver catalogos.md §2) tenía una 4ta flag "activa" que NO existe en
// `back/catalogos/model.py::Ubicacion` ni en `UbicacionOut`. No se agrega
// acá.
export interface Ubicacion {
  id: string;
  nombre: string;
  permite_prestamo_llaves: boolean;
  permite_devolucion_llaves: boolean;
  permite_prestamo_equipos: boolean;
}

export interface UbicacionInput {
  nombre: string;
  permite_prestamo_llaves: boolean;
  permite_devolucion_llaves: boolean;
  permite_prestamo_equipos: boolean;
}

export interface Salon {
  id: string;
  nombre: string;
  bloque_id: string;
  tipo_silleteria_id: string;
  cantidad_sillas: number;
  cantidad_mesas: number;
}

export interface SalonInput {
  nombre: string;
  bloque_id: string;
  tipo_silleteria_id: string;
  cantidad_sillas: number;
  cantidad_mesas: number;
}
