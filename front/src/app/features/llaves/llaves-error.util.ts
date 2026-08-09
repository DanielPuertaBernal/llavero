import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './llaves.models';

/**
 * Copia local de la utilidad homónima de `features/catalogos` — duplicada a
 * propósito: ninguna feature importa código de otra feature (regla dura,
 * ver front/README.md). Cuando una tercera feature la necesite se evaluará
 * promoverla a `core/`, no antes.
 *
 * Los endpoints de llaves devuelven errores de negocio como
 * `{detail: string}` (ver back/llaves/controller.py):
 *
 * - 400 en `POST /api/llaves/`: la entrega no es válida — el salón, la
 *   persona, el usuario o la ubicación no existen; la ubicación no permite
 *   préstamo de llaves; el salón ya tiene una llave en préstamo; o se envió
 *   `reserva_id` con un `origen` distinto de `reserva_individual`.
 * - 400 en `POST /api/llaves/{id}/devolver`: la llave ya fue devuelta, la
 *   ubicación no permite devolución, o la novedad/usuario no existen.
 * - 404: la llave no existe.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual. Regla del proyecto: NO se replica ninguna de esas validaciones
 * del lado cliente (por ejemplo, no se bloquea el envío por
 * `permite_devolucion_llaves`) — el backend es la única autoridad sobre las
 * reglas de negocio y su 400 es la respuesta que ve el usuario.
 */
export function extraerMensajeError(error: unknown, mensajePorDefecto: string): string {
  if (error instanceof HttpErrorResponse) {
    const cuerpo = error.error as ErrorDetalleDto | null | undefined;
    if (cuerpo && typeof cuerpo.detail === 'string' && cuerpo.detail.length > 0) {
      return cuerpo.detail;
    }
  }
  return mensajePorDefecto;
}
