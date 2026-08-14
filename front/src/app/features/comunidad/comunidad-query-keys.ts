/**
 * Claves de TanStack Query de la feature `comunidad`, centralizadas acá
 * igual que en `usuarios`, `catalogos`, `llaves` y `prestamos`.
 *
 * Feature de SOLO LECTURA (ver la nota de alcance en `comunidad.service.ts`):
 * no hay mutaciones, así que no hay un `invalidar()` público que necesite
 * invalidar por prefijo -- `raiz` existe igual, por consistencia con el
 * resto de features y por si en el futuro se agrega una consulta puntual
 * que deba colgar del mismo prefijo que `lista`.
 *
 * El lookup de tipos de persona NO cuelga de la raíz: es un catálogo de
 * otro módulo del backend (`catalogos`) que esta feature nunca invalida,
 * mismo criterio que `usuariosQueryKeys.lookupRoles`/`lookupUbicaciones`.
 */
export const comunidadQueryKeys = {
  raiz: ['comunidad'] as const,
  lista: ['comunidad', 'lista'] as const,
  lookupTiposPersona: ['comunidad-lookups', 'tipos-persona'] as const,
};
