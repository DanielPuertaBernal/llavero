import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './programacion.models';

/** Copia del criterio ya documentado en `features/catalogos/catalogos-error.util.ts`
 * y `features/reservas/reservas-error.util.ts`: ninguna feature importa el
 * TypeScript de otra (ver front/README.md). El único 400 del módulo
 * (`POST /importar`, archivo sin datos reconocibles o sin fecha de semestre
 * en ninguna fuente) ya trae un mensaje apto para mostrarse tal cual. */
export function extraerMensajeError(error: unknown, mensajePorDefecto: string): string {
  if (error instanceof HttpErrorResponse) {
    const cuerpo = error.error as ErrorDetalleDto | null | undefined;
    if (cuerpo && typeof cuerpo.detail === 'string' && cuerpo.detail.length > 0) {
      return cuerpo.detail;
    }
  }
  return mensajePorDefecto;
}
