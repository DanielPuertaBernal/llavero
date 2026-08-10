/**
 * Claves de TanStack Query de la feature `usuarios`, centralizadas acá
 * igual que en `catalogos`, `llaves` y `prestamos`.
 *
 * Dos particularidades de esta feature:
 *
 * 1. La lista tiene UNA sola fuente: `GET /api/usuarios/`. A diferencia de
 *    `llaves` y `prestamos`, el backend no expone un
 *    `GET /estado/{estado}`, así que no hay una familia `porEstado(...)`:
 *    el filtro de activos/inactivos se resuelve en el cliente sobre esta
 *    misma lista (ver el docblock de `UsuariosListComponent`). `lista`
 *    igual cuelga de `raiz` para que `UsuariosService.invalidar()` siga
 *    invalidando por prefijo, sin enumerar claves puntuales.
 *
 * 2. Los lookups (roles, ubicaciones) NO cuelgan de `raiz`: son datos de
 *    `catalogos`, que una mutación de usuarios no invalida jamás.
 *    Colgarlos de `['usuarios']` los haría refetchear sin motivo cada vez
 *    que se crea o se desactiva un usuario.
 */
export const usuariosQueryKeys = {
  raiz: ['usuarios'] as const,
  lista: ['usuarios', 'lista'] as const,
  lookupRoles: ['usuarios-lookups', 'roles'] as const,
  lookupUbicaciones: ['usuarios-lookups', 'ubicaciones'] as const,
};
