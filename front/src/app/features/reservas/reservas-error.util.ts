import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './reservas.models';

/**
 * Copia local de la utilidad homónima de `features/prestamos`,
 * `features/llaves` y `features/catalogos` — duplicada a propósito: ninguna
 * feature importa código de otra feature (regla dura, ver front/README.md).
 * Cuando la promoción a `core/` esté justificada se evaluará, no antes.
 *
 * Los endpoints de reservas devuelven errores de negocio como
 * `{detail: string}` (ver back/reservas/controller.py):
 *
 * - 400 en `POST /api/reservas/`: el salón o el solicitante no existen, o la
 *   franja horaria se solapa con otra reserva ya `aprobada` del mismo salón
 *   esa fecha (`reservas.service.crear_reserva`).
 * - 400 en `POST /api/reservas/{id}/cancelar`: la reserva no existe, o no
 *   está en `aprobada` (solo una reserva aprobada se puede cancelar).
 * - 404 en `GET /api/reservas/{id}`: la reserva no existe.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual. Regla del proyecto: NO se replica ninguna de esas validaciones
 * del lado cliente. En particular NO se comprueba el solapamiento de franjas
 * en el navegador — la lista cargada puede estar desactualizada frente a otra
 * pestaña, así que cualquier chequeo cliente sería una adivinanza: el backend
 * es la única autoridad y su 400 es la respuesta que ve el usuario.
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
