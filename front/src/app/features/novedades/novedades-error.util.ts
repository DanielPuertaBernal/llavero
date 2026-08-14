import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './novedades.models';

/**
 * Copia local de la utilidad homónima de `usuarios`/`monitores`/`reservas` —
 * duplicada a propósito: ninguna feature importa código de otra feature
 * (regla dura, ver front/README.md).
 *
 * Los endpoints de novedades devuelven errores de negocio como
 * `{detail: string}` (ver back/novedades/controller.py):
 *
 * - 400 en `POST /api/novedades/`: `registrado_por_id` no existe en usuarios
 *   (ver `service.crear_novedad`).
 * - 400 en `POST /api/novedades/{id}/cerrar`: `solucion` vacía.
 * - 404 en `POST /api/novedades/{id}/cerrar` y `GET /api/novedades/{id}`: la
 *   novedad no existe.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual.
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
