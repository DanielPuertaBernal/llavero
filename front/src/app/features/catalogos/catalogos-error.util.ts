import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './catalogos.models';

/**
 * Los endpoints de catalogos devuelven errores de negocio como
 * `{detail: string}` (ver back/catalogos/controller.py):
 *
 * - 400 en DELETE: la entidad sigue referenciada por otro registro
 *   (`ProtectedError` de Django traducido a un mensaje claro en
 *   `back/catalogos/service.py`, ej. "No se puede eliminar el bloque
 *   porque tiene salones asociados").
 * - 400 en PATCH/POST de Salon: `bloque_id`/`tipo_silleteria_id` inválido.
 * - 404: la entidad no existe (no debería ocurrir en uso normal de la UI,
 *   pero cubre la carrera de que otro usuario ya la borró).
 *
 * Ese mensaje ya es apto para mostrarse al usuario tal cual — no hay que
 * tratarlo como un fallo genérico ("algo salió mal"). Ver la regla del
 * enunciado de la tarea: NO hacer un chequeo "¿está en uso?" del lado
 * cliente (a diferencia del legacy, que sí lo hacía para `bloque` pero no
 * para `tipo_silleteria` — asimetría ya corregida acá al no replicar
 * ningún chequeo cliente y confiar 100% en la respuesta del backend).
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
