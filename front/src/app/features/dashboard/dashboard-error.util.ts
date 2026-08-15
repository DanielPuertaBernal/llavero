import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './dashboard.models';

/**
 * Copia local de la utilidad homónima de `historial`/`comunidad`/
 * `usuarios`/`monitores`/`reservas`/`prestamos` -- duplicada a propósito:
 * ninguna feature importa código de otra (regla dura, ver
 * front/README.md).
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
