import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './prestamos.models';

/**
 * Copia local de la utilidad homónima de `features/catalogos` y
 * `features/llaves` — duplicada a propósito: ninguna feature importa código
 * de otra feature (regla dura, ver front/README.md). Cuando la promoción a
 * `core/` esté justificada se evaluará, no antes.
 *
 * Los endpoints de préstamos devuelven errores de negocio como
 * `{detail: string}` (ver back/prestamos/controller.py):
 *
 * - 400 en `POST /api/prestamos/`: el préstamo no es válido — no se envió
 *   ningún equipo; el solicitante, el usuario prestamista, la ubicación o
 *   alguno de los equipos no existe; la ubicación no permite préstamo de
 *   equipos; o alguno de los equipos ya está entregado en otro préstamo
 *   activo.
 * - 400 en `POST /api/prestamos/{id}/devolver`: no se envió ningún equipo,
 *   el equipo no pertenece a ese préstamo, o el equipo ya fue devuelto.
 * - 404: el préstamo no existe.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual. Regla del proyecto: NO se replica ninguna de esas validaciones
 * del lado cliente. En particular NO se pre-filtran los equipos por
 * disponibilidad — no existe endpoint que diga cuáles están tomados, así
 * que cualquier filtro cliente sería una adivinanza — y NO se bloquea el
 * envío por `permite_prestamo_equipos`: el backend es la única autoridad
 * sobre las reglas de negocio y su 400 es la respuesta que ve el usuario.
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
