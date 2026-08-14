/**
 * Claves de TanStack Query de la feature `historial`, centralizadas acá
 * igual que en `comunidad`, `reservas`, `monitores` y `novedades`.
 *
 * Feature de SOLO LECTURA (ver la nota de alcance en `historial.service.ts`):
 * no hay mutaciones, así que no hay un `invalidar()` público.
 *
 * `lista` cuelga del `usuarioIdFiltro` resuelto (o `null` cuando no se filtra,
 * ver historial.service.ts): Administrador/Auxiliar ven la lista completa
 * bajo la clave `[..., null]`, mientras que cada Portero tiene su propia
 * entrada de caché bajo `[..., <su usuario_id>]` -- así un cambio de sesión
 * (login/logout) nunca sirve de caché la lista filtrada de otro usuario.
 *
 * `rolActual` NO cuelga de la raíz de historial: es la resolución del ROL del
 * usuario autenticado (ver `resolverNombreRol` en core/auth/rol-resolver.ts),
 * no un dato del propio historial -- mismo criterio que
 * `comunidadQueryKeys.lookupTiposPersona` no cuelga de `raiz`.
 *
 * Los cuatro lookups (usuarios/comunidad/salones/equipos) tampoco cuelgan de
 * la raíz: son catálogos de otros módulos del backend que esta feature nunca
 * invalida.
 */
export const historialQueryKeys = {
  raiz: ['historial'] as const,
  lista: (usuarioIdFiltro: string | null) => ['historial', 'lista', usuarioIdFiltro] as const,
  rolActual: (rolId: string | null) => ['historial-rol-actual', rolId] as const,
  lookupUsuarios: ['historial-lookups', 'usuarios'] as const,
  lookupPersonas: ['historial-lookups', 'comunidad'] as const,
  lookupSalones: ['historial-lookups', 'salones'] as const,
  lookupEquipos: ['historial-lookups', 'equipos'] as const,
};
