import type { EstadoPrestamo } from './prestamos.models';

/**
 * Claves de TanStack Query de la feature `prestamos`, centralizadas acá
 * igual que en `catalogos` y `llaves`.
 *
 * Tres particularidades de esta feature:
 *
 * 1. La lista de préstamos tiene DOS fuentes según el filtro de estado:
 *    `GET /api/prestamos/` (sin filtro) y
 *    `GET /api/prestamos/estado/{estado}`. Son respuestas distintas, así que
 *    cada una necesita su propia clave — `porEstado(estado)` es una función,
 *    no una constante, para que cada estado tenga su entrada de caché
 *    independiente.
 *
 * 2. `detalles(id)` y `devoluciones(id)` también son funciones: cada
 *    préstamo expandido en la tabla tiene su propia entrada de caché, de
 *    modo que abrir varias filas a la vez no hace que una pise a la otra.
 *
 * 3. TODAS las claves anteriores cuelgan de `raiz`, y eso es deliberado:
 *    una devolución cambia el estado del préstamo (cambia de lista por
 *    estado), agrega una fila a sus devoluciones y cambia el
 *    `estado_equipo` de sus detalles. Una sola invalidación por prefijo
 *    (ver `PrestamosService.invalidar`) refresca las tres cosas a la vez;
 *    invalidar clave por clave dejaría alguna desactualizada.
 *
 * En cambio los lookups (personas, usuarios, ubicaciones, equipos,
 * novedades) NO cuelgan de `raiz`: son datos de otros módulos del backend
 * que una mutación de préstamos no invalida jamás. Colgarlos de
 * `['prestamos']` los haría refetchear sin motivo en cada préstamo o
 * devolución.
 */
export const prestamosQueryKeys = {
  raiz: ['prestamos'] as const,
  lista: ['prestamos', 'lista'] as const,
  porEstado: (estado: EstadoPrestamo) => ['prestamos', 'estado', estado] as const,
  detalles: (prestamoId: string) => ['prestamos', 'detalles', prestamoId] as const,
  devoluciones: (prestamoId: string) => ['prestamos', 'devoluciones', prestamoId] as const,
  lookupPersonas: ['prestamos-lookups', 'personas'] as const,
  lookupUsuarios: ['prestamos-lookups', 'usuarios'] as const,
  lookupUbicaciones: ['prestamos-lookups', 'ubicaciones'] as const,
  lookupEquipos: ['prestamos-lookups', 'equipos'] as const,
  lookupNovedades: ['prestamos-lookups', 'novedades'] as const,
};
