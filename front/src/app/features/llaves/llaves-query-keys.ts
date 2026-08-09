import type { EstadoLlave } from './llaves.models';

/**
 * Claves de TanStack Query de la feature `llaves`, centralizadas acá igual
 * que en `catalogos` (ver catalogos-query-keys.ts).
 *
 * Dos particularidades de esta feature:
 *
 * 1. La lista de llaves tiene DOS fuentes según el filtro de estado:
 *    `GET /api/llaves/` (sin filtro) y `GET /api/llaves/estado/{estado}`.
 *    Son respuestas distintas, así que cada una necesita su propia clave —
 *    `porEstado(estado)` es una función, no una constante, para que cada
 *    estado tenga su entrada de caché independiente. Ambas cuelgan de
 *    `raiz`, de modo que una sola invalidación por prefijo (ver
 *    `LlavesService.invalidar`) refresca la lista completa y todas las
 *    listas por estado a la vez: tras crear o devolver una llave, la fila
 *    cambia de estado y por lo tanto de lista.
 *
 * 2. Los lookups (salones, ubicaciones, personas, usuarios, novedades)
 *    NO cuelgan de `raiz`: son datos de otros módulos del backend que una
 *    mutación de llaves no invalida jamás. Colgarlos de `['llaves']` los
 *    haría refetchear sin motivo en cada entrega/devolución.
 */
export const llavesQueryKeys = {
  raiz: ['llaves'] as const,
  lista: ['llaves', 'lista'] as const,
  porEstado: (estado: EstadoLlave) => ['llaves', 'estado', estado] as const,
  lookupSalones: ['llaves-lookups', 'salones'] as const,
  lookupUbicaciones: ['llaves-lookups', 'ubicaciones'] as const,
  lookupPersonas: ['llaves-lookups', 'personas'] as const,
  lookupUsuarios: ['llaves-lookups', 'usuarios'] as const,
  lookupNovedades: ['llaves-lookups', 'novedades'] as const,
};
