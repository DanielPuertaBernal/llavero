import { HttpErrorResponse } from '@angular/common/http';

import type { ErrorDetalleDto } from './usuarios.models';

/**
 * Copia local de la utilidad homónima de `catalogos`/`llaves`/`prestamos` —
 * duplicada a propósito: ninguna feature importa código de otra feature
 * (regla dura, ver front/README.md).
 *
 * Los endpoints de usuarios devuelven errores de negocio como
 * `{detail: string}` (ver back/usuarios/controller.py):
 *
 * - 400 en `POST /api/usuarios/`: el `rol_id` o el `ubicacion_id` no
 *   existen en catalogos, o el `email_institucional` ya está tomado (la
 *   unicidad la impone la base de datos, no una validación previa).
 * - 400 en `POST /api/usuarios/{id}/desactivar`: autoprotección — un
 *   usuario no puede desactivarse a sí mismo (`AutodesactivacionError`
 *   extiende `ValueError`, así que el controller lo mapea a 400 con su
 *   propio mensaje, no a un 403).
 * - 404 en `POST /api/usuarios/{id}/desactivar`: el usuario no existe.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual. Regla del proyecto: NO se replica ninguna de esas validaciones
 * del lado cliente — en particular, la unicidad del correo NO se
 * pre-chequea con una consulta extra, y la autoprotección se refleja en la
 * UI solo deshabilitando el botón de la propia fila (que es no ofrecer una
 * acción inexistente, no validar), dejando que el backend siga siendo la
 * única autoridad.
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
