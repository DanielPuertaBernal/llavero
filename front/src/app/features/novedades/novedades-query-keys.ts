import type { CategoriaNovedad, EstadoNovedad } from './novedades.models';

/**
 * Claves de TanStack Query de la feature `novedades`, centralizadas acá igual
 * que en `catalogos`, `llaves`, `prestamos`, `usuarios`, `reservas` y
 * `monitores`.
 *
 * Dos particularidades de esta feature:
 *
 * 1. La lista tiene TRES fuentes según el filtro activo: `GET /api/novedades/`
 *    (sin filtro), `GET /api/novedades/estado/{estado}` y
 *    `GET /api/novedades/categoria/{categoria}` — mismo patrón que
 *    `reservasQueryKeys.porEstado`/`porSolicitante`. Son respuestas distintas,
 *    así que cada una necesita su propia clave — `porEstado(estado)`/
 *    `porCategoria(categoria)` son funciones, no constantes, para que cada
 *    estado/categoría tenga su propia entrada de caché independiente.
 *
 * 2. Las tres claves anteriores cuelgan de `raiz`, y eso es deliberado: cerrar
 *    una novedad cambia su `estado`, que aparece tanto en la lista completa
 *    como en la de su estado y en la de su categoría. Una sola invalidación
 *    por prefijo (ver `NovedadesService.invalidar`) refresca las tres a la
 *    vez.
 *
 * En cambio `lookupUsuarios` NO cuelga de `raiz`: es un dato de `usuarios`,
 * que una mutación de novedades no invalida jamás. Colgarlo de `['novedades']`
 * lo haría refetchear sin motivo en cada novedad creada o cerrada.
 */
export const novedadesQueryKeys = {
  raiz: ['novedades'] as const,
  lista: ['novedades', 'lista'] as const,
  porEstado: (estado: EstadoNovedad) => ['novedades', 'estado', estado] as const,
  porCategoria: (categoria: CategoriaNovedad) => ['novedades', 'categoria', categoria] as const,
  lookupUsuarios: ['novedades-lookups', 'usuarios'] as const,
};
