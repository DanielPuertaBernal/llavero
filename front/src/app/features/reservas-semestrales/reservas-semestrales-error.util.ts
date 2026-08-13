import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './reservas-semestrales.models';

/**
 * Copia local de la utilidad homónima de `features/reservas` (y de
 * `prestamos`, `llaves`, `catalogos`) — duplicada a propósito: ninguna
 * feature importa código de otra feature (regla dura, ver front/README.md).
 *
 * Los endpoints de reservas semestrales devuelven errores de negocio como
 * `{detail: string}` (ver back/reservas_semestrales/controller.py):
 *
 * - 400 en `POST /api/reservas-semestrales/`: una franja inválida
 *   (`hora_inicio >= hora_fin`), una FK inexistente (salón, solicitante o
 *   semestre), o solapamiento con otra reserva semestral o con una
 *   `Programacion` ya programada en ese salón/día/franja.
 * - 400 en `POST /api/reservas-semestrales/grupo/{grupo_id}/cancelar`:
 *   alguna franja del grupo tiene `creado_manualmente=false` (cargada
 *   institucionalmente, no cancelable vía API).
 * - 404 en `GET /api/reservas-semestrales/{id}` y en
 *   `POST /grupo/{grupo_id}/cancelar`: el recurso no existe.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual. Regla del proyecto: NO se replica ninguna de esas validaciones
 * del lado cliente — en particular no se comprueba el solapamiento de
 * franjas en el navegador. El backend es la única autoridad.
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
