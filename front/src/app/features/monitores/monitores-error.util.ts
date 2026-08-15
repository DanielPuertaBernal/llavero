import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './monitores.models';

/**
 * Copia local de la utilidad homónima de `usuarios`/`reservas`/`prestamos` —
 * duplicada a propósito: ninguna feature importa código de otra feature
 * (regla dura, ver front/README.md).
 *
 * Los endpoints de monitores devuelven errores de negocio como
 * `{detail: string}` (ver back/monitores/controller.py):
 *
 * - 400 en `POST /api/monitores/`: `docente_titular_id`/`monitor_delegado_id`
 *   no existen en `comunidad`, o son la misma persona
 *   (`domain.validar_docente_distinto_de_monitor`, ver
 *   back/monitores/service.py).
 * - 404 en `POST /api/monitores/{id}/desactivar`: la monitoría no existe.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual. Regla del proyecto: NO se replica ninguna de esas validaciones
 * del lado cliente — en particular, "docente titular distinto de monitor
 * delegado" NO se pre-chequea comparando los dos selectores del formulario;
 * el backend es la única autoridad y su 400 es la respuesta que ve el
 * operador.
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
