// Formas de request/response de los endpoints `/api/comunidad/*` (Django
// Ninja, ver back/comunidad/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra el schema `ComunidadOut` del
// controller (no adivinados).
//
// Igual que en `features/usuarios`, `features/catalogos`, `features/llaves`
// y `features/prestamos`: las interfaces se consumen tal cual dentro de la
// propia feature, sin capa pública que esconder detrás de un mapeo, así que
// se mantiene el nombre de campo exacto que viaja por HTTP (snake_case).
//
// Nota de alcance — RF26/RF25 (ver comunidad.service.ts para la nota
// completa): esta feature es ESTRICTAMENTE DE SOLO LECTURA. `ComunidadOut`
// es la única forma que se modela acá; `ComunidadIn` (el cuerpo de
// `POST /api/comunidad/`, ver el controller) NO se modela porque esta UI
// nunca crea ni edita personas.

export interface ErrorDetalleDto {
  detail: string;
}

/**
 * `ComunidadOut` del controller. El catálogo maestro de personas de la
 * universidad (docentes/estudiantes/empleados), alimentado por un ETL
 * externo (ver back/comunidad/model.py) — nunca por esta UI.
 *
 * `tipo_persona_id` es un UUID crudo (FK a `catalogos.TipoPersona`): esta
 * feature lo resuelve a nombre legible vía `ComunidadLookupsService`, igual
 * que `usuarios` resuelve `rol_id`/`ubicacion_id`.
 *
 * `id_carnet`, `correo`, `numero_contacto` y `facultad` son nullable en el
 * schema (ver el DDL citado en el docstring de `back/comunidad/model.py`):
 * el ETL institucional no siempre trae los cuatro datos para cada persona.
 */
export interface Persona {
  id: string;
  numero_documento: string;
  nombre: string;
  tipo_persona_id: string;
  id_carnet: string | null;
  correo: string | null;
  numero_contacto: string | null;
  facultad: string | null;
}

// ------------------------------------------------------------------
// Lookup
// ------------------------------------------------------------------
//
// `TipoPersonaOut` de back/catalogos/controller.py (endpoint verificado:
// `GET /api/catalogos/tipos-persona`, NO `/tipos-persona` a secas fuera del
// prefijo del router). Mismo criterio que `RolLookup`/`UbicacionLookup` en
// `features/usuarios`: solo los dos campos que esta vista necesita para
// resolver `tipo_persona_id` a un nombre legible en la tabla.

export interface TipoPersonaLookup {
  id: string;
  nombre: string;
}
