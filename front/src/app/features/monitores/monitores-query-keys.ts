/**
 * Claves de TanStack Query de la feature `monitores`, centralizadas acá
 * igual que en `catalogos`, `llaves`, `prestamos`, `usuarios` y `reservas`.
 *
 * Tres particularidades de esta feature:
 *
 * 1. La lista tiene UNA sola fuente: `GET /api/monitores/`. Igual que en
 *    `usuarios`, el backend no expone un `GET /estado/{estado}`, así que no
 *    hay una familia `porEstado(...)`: el filtro de activos/inactivos se
 *    resuelve en el cliente (ver el docblock de `MonitoresListComponent`).
 *
 * 2. El lookup de personas (`lookupPersonas`) NO cuelga de `raiz`: es un dato
 *    de `comunidad`, que una mutación de monitores nunca invalida. Colgarlo
 *    de `['monitores']` lo haría refetchear sin motivo cada vez que se crea o
 *    se desactiva una monitoría.
 *
 * 3. `clasesDocenteTitular(monitorId)` tampoco cuelga de `raiz`, y por una
 *    razón distinta a la del punto 2: es un dato de `programacion` (las
 *    clases del docente), no de `monitores` — crear o desactivar una
 *    monitoría no cambia el horario de nadie. Es una función (no una
 *    constante) porque cada monitoría expandida en la tabla necesita su
 *    propia entrada de caché, mismo criterio que
 *    `prestamosQueryKeys.detalles(id)`.
 */
export const monitoresQueryKeys = {
  raiz: ['monitores'] as const,
  lista: ['monitores', 'lista'] as const,
  lookupPersonas: ['monitores-lookups', 'personas'] as const,
  clasesDocenteTitular: (monitorId: string) =>
    ['monitores-clases-docente-titular', monitorId] as const,
};
