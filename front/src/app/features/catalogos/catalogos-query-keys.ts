/**
 * Claves de TanStack Query de la feature `catalogos`, centralizadas acá en
 * vez de repetidas como arrays literales en cada servicio: varias
 * mutaciones necesitan invalidar la queryKey de una entidad DISTINTA a la
 * que mutan.
 *
 * `bloque` y `tipo_silleteria` son denormalizados-ish en la vista de
 * salones (cada `Salon` solo trae `bloque_id`/`tipo_silleteria_id`, el
 * nombre se resuelve en el cliente uniendo con la lista de bloques/tipos) —
 * por eso mutar cualquiera de los dos catálogos también invalida `salones`,
 * para que un salón ya cacheado no siga mostrando un nombre viejo tras un
 * rename. El frontend legacy invalidaba esto para `bloque` pero NO para
 * `tipo_silleteria` (ver AulaSync/analisis/frontend/catalogos.md §8,
 * "Invalidación de cache asimétrica" — bug documentado, no se repite acá).
 */
export const catalogosQueryKeys = {
  bloques: ['catalogos', 'bloques'] as const,
  tiposSilleteria: ['catalogos', 'tipos-silleteria'] as const,
  ubicaciones: ['catalogos', 'ubicaciones'] as const,
  salones: ['catalogos', 'salones'] as const,
};
