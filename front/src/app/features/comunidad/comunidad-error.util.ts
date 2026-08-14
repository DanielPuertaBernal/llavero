import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './comunidad.models';

/**
 * Copia local de la utilidad homónima de `usuarios`/`monitores`/`reservas`/
 * `prestamos` -- duplicada a propósito: ninguna feature importa código de
 * otra feature (regla dura, ver front/README.md).
 *
 * Esta feature es de solo lectura (ver la nota de alcance en
 * `comunidad.service.ts`): en la práctica, el único error que
 * `extraerMensajeError` puede llegar a formatear acá es el de la propia
 * consulta de lista (`GET /api/comunidad/`) o del lookup de tipos de
 * persona (`GET /api/catalogos/tipos-persona`) si el backend responde con
 * un cuerpo `{detail: string}`.
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
