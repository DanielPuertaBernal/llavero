import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './notificaciones.models';

/**
 * Copia local de la utilidad homónima de `features/reservas`,
 * `features/prestamos`, `features/llaves` y `features/catalogos` —
 * duplicada a propósito: ninguna feature importa código de otra feature
 * (regla dura, ver front/README.md). Cuando la promoción a `core/` esté
 * justificada se evaluará, no antes.
 *
 * Los endpoints de envío de notificaciones devuelven errores de negocio como
 * `{detail: string}` (ver back/notificaciones/controller.py):
 *
 * - 400 en `POST /api/notificaciones/manual`: `destinatario_id` o
 *   `enviado_por_id` no existen (`service.enviar_notificacion_manual`).
 * - 400 en `POST /api/notificaciones/recordatorio`: `destinatario_id` no
 *   existe (`service.enviar_recordatorio`).
 * - 404 en `GET /api/notificaciones/{id}`: la notificación no existe (esta
 *   feature no consume ese endpoint, ver notificaciones.service.ts).
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual. Regla del proyecto: NO se replica ninguna validación del backend
 * del lado cliente — que el destinatario exista lo decide `comunidad.service`
 * vía `notificaciones.service`, no un chequeo adivinado en el navegador.
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
