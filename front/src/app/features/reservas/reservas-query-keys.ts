import type { EstadoReserva } from './reservas.models';

/**
 * Claves de TanStack Query de la feature `reservas`, centralizadas acá igual
 * que en `catalogos`, `llaves`, `prestamos` y `usuarios`.
 *
 * Dos particularidades de esta feature:
 *
 * 1. La lista de reservas tiene TRES fuentes según el filtro activo:
 *    `GET /api/reservas/` (sin filtro), `GET /api/reservas/solicitante/
 *    {solicitante_id}` y `GET /api/reservas/estado/{estado}` — mismo patrón
 *    que `prestamosQueryKeys.porEstado`. Son respuestas distintas, así que
 *    cada una necesita su propia clave — `porSolicitante(id)`/`porEstado
 *    (estado)` son funciones, no constantes, para que cada solicitante/
 *    estado tenga su entrada de caché independiente.
 *
 * 2. Las tres claves anteriores cuelgan de `raiz`, y eso es deliberado: una
 *    cancelación cambia el `estado` de la reserva, que aparece tanto en la
 *    lista completa como en la del solicitante y en la de su estado. Una
 *    sola invalidación por prefijo (ver `ReservasService.invalidar`)
 *    refresca las tres a la vez; invalidar clave por clave dejaría alguna
 *    desactualizada.
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
  porEstado: (estado: EstadoReserva) => ['reservas', 'estado', estado] as const,
  lookupPersonas: ['reservas-lookups', 'personas'] as const,
  lookupSalones: ['reservas-lookups', 'salones'] as const,
};
