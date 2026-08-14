import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './configuracion.models';

/**
 * Copia local de la utilidad homónima de `usuarios`/`llaves`/`prestamos` —
 * duplicada a propósito: ninguna feature importa código de otra feature
 * (regla dura, ver front/README.md).
 *
 * `PUT /api/configuracion/` devuelve su único error de negocio como
 * `{detail: string}` (ver back/configuracion/controller.py): 400 cuando
 * `ubicacion_defecto_id` no existe en catalogos. Ese mensaje ya viene
 * redactado para el usuario final, así que se muestra tal cual.
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
