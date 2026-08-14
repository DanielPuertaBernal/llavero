/**
 * Claves de TanStack Query de la feature `disponibilidad`, centralizadas acá
 * igual que en `reservas`, `catalogos`, `llaves`, `prestamos` y `usuarios`.
 *
 * La consulta principal depende de DOS signals a la vez — el salón elegido y
 * la fecha elegida (ver `disponibilidad.service.ts`) — y cada combinación
 * salonId+fecha es una respuesta distinta del backend (mismo salón, otra
 * fecha, trae otras ocupaciones y otros conflictos). Por eso
 * `porSalonYFecha` es una función, no una constante: cada combinación
 * necesita su propia entrada de caché, igual que `reservasQueryKeys.
 * porSolicitante(id)` hace con el solicitante.
 *
 * `fecha` puede ser `null` (modo "sin fecha" del contrato: recurrentes de un
 * día + todas las individuales, sin conflictos) y forma parte de la clave
 * igual que si tuviera valor — es una respuesta distinta a la de cualquier
 * fecha concreta.
 *
 * El lookup de salones NO cuelga de la raíz: es un catálogo de otro módulo
 * del backend que esta feature de solo lectura nunca invalida (no hay
 * mutaciones acá, a diferencia de `reservas`).
 */
export const disponibilidadQueryKeys = {
  raiz: ['disponibilidad'] as const,
  porSalonYFecha: (salonId: string, fecha: string | null) =>
    ['disponibilidad', salonId, fecha] as const,
  lookupSalones: ['disponibilidad-lookups', 'salones'] as const,
};
