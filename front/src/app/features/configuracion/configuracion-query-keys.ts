/**
 * Claves de TanStack Query de la feature `configuracion`, centralizadas acá
 * igual que en el resto de features.
 *
 * A diferencia de todas las anteriores, esta feature es un SINGLETON: no hay
 * lista, no hay filtro, no hay una entidad por id — solo una fila que
 * siempre existe (ver la nota de alcance en `configuracion.models.ts`). Por
 * eso `raiz` es también la clave exacta de la consulta GET, sin una entrada
 * `lista` intermedia: no existe una colección de la que `raiz` sea el
 * prefijo, solo esta única fila.
 *
 * El lookup de ubicaciones NO cuelga de `raiz`: es un catálogo de otro
 * módulo del backend que `PUT /api/configuracion/` nunca invalida.
 */
export const configuracionQueryKeys = {
  raiz: ['configuracion'] as const,
  lookupUbicaciones: ['configuracion-lookups', 'ubicaciones'] as const,
};
