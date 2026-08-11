/**
 * Claves de TanStack Query de la feature `reservas`, centralizadas acá igual
 * que en `catalogos`, `llaves`, `prestamos` y `usuarios`.
 *
 * Dos particularidades de esta feature:
 *
 * 1. La lista de reservas tiene DOS fuentes según el filtro de solicitante:
 *    `GET /api/reservas/` (sin filtro) y
 *    `GET /api/reservas/solicitante/{solicitante_id}`. Son respuestas
 *    distintas, así que cada una necesita su propia clave —
 *    `porSolicitante(id)` es una función, no una constante, para que cada
 *    solicitante tenga su entrada de caché independiente.
 *
 *    NO hay clave equivalente por estado: a diferencia de `prestamos`, el
 *    backend de reservas no expone `GET /estado/{estado}` (ver
 *    back/reservas/controller.py), así que ese filtro se resuelve en el
 *    cliente sobre la lista ya descargada y no genera una consulta propia.
 *
 * 2. Las dos claves anteriores cuelgan de `raiz`, y eso es deliberado: una
 *    cancelación cambia el `estado` de la reserva, que aparece tanto en la
 *    lista completa como en la del solicitante. Una sola invalidación por
 *    prefijo (ver `ReservasService.invalidar`) refresca ambas a la vez;
 *    invalidar clave por clave dejaría alguna desactualizada.
 *
 * En cambio los lookups (personas, salones) NO cuelgan de `raiz`: son datos
 * de otros módulos del backend que una mutación de reservas no invalida
 * jamás. Colgarlos de `['reservas']` los haría refetchear sin motivo en cada
 * reserva creada o cancelada.
 */
export const reservasQueryKeys = {
  raiz: ['reservas'] as const,
  lista: ['reservas', 'lista'] as const,
  porSolicitante: (solicitanteId: string) => ['reservas', 'solicitante', solicitanteId] as const,
  lookupPersonas: ['reservas-lookups', 'personas'] as const,
  lookupSalones: ['reservas-lookups', 'salones'] as const,
};
