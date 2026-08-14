import type { EstadoEnvioNotificacion, TipoNotificacion } from './notificaciones.models';

/**
 * Claves de TanStack Query de la feature `notificaciones`, centralizadas acá
 * igual que en `catalogos`, `llaves`, `prestamos`, `usuarios` y `reservas`.
 *
 * Dos particularidades, mismo criterio que `reservasQueryKeys`:
 *
 * 1. La lista tiene TRES fuentes según el filtro activo: `GET
 *    /api/notificaciones/` (sin filtro), `GET /api/notificaciones/tipo/{tipo}`
 *    y `GET /api/notificaciones/estado-envio/{estado_envio}`. Son respuestas
 *    distintas, así que cada una necesita su propia clave — `porTipo(tipo)`/
 *    `porEstadoEnvio(estado)` son funciones, no constantes, para que cada
 *    tipo/estado tenga su entrada de caché independiente.
 *
 * 2. Las tres cuelgan de `raiz`: enviar una notificación (manual o
 *    recordatorio) crea una fila nueva que puede aparecer tanto en la lista
 *    completa como en la de su tipo y en la de su estado de envío. Una sola
 *    invalidación por prefijo (ver `NotificacionesService.invalidar`)
 *    refresca las tres a la vez.
 *
 * `porDestinatario(id)` existe porque el backend expone `GET
 * /api/notificaciones/destinatario/{destinatario_id}` (ver
 * back/notificaciones/controller.py), aunque esta feature no lo consuma hoy
 * desde ningún componente — se declara la clave para que exista un único
 * lugar donde definirla si se agrega ese filtro más adelante, mismo criterio
 * que declarar la forma completa de un DTO aunque no se use cada campo.
 *
 * `lookupPersonas` NO cuelga de `raiz`: es dato de otro módulo del backend
 * (`comunidad`) que enviar una notificación jamás invalida. Colgarlo de
 * `['notificaciones']` lo haría refetchear sin motivo tras cada envío.
 */
export const notificacionesQueryKeys = {
  raiz: ['notificaciones'] as const,
  lista: ['notificaciones', 'lista'] as const,
  porDestinatario: (destinatarioId: string) =>
    ['notificaciones', 'destinatario', destinatarioId] as const,
  porTipo: (tipo: TipoNotificacion) => ['notificaciones', 'tipo', tipo] as const,
  porEstadoEnvio: (estadoEnvio: EstadoEnvioNotificacion) =>
    ['notificaciones', 'estado-envio', estadoEnvio] as const,
  lookupPersonas: ['notificaciones-lookups', 'personas'] as const,
};
