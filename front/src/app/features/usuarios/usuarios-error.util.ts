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
 * - 404 en `POST /api/usuarios/{id}/desactivar`, `PATCH /api/usuarios/{id}`
 *   y `POST /api/usuarios/{id}/reactivar`: el usuario no existe.
 * - 400 en `PATCH /api/usuarios/{id}`: el `rol_id` o el `ubicacion_id`
 *   enviados no existen en catalogos.
 *
 * Ese mensaje ya viene redactado para el usuario final, así que se muestra
 * tal cual.
 *
 * Excepción conocida — el correo duplicado en `PATCH`: el backend no valida
 * la unicidad de `email_institucional` en Python, así que el error de
 * Postgres se propaga como 500 SIN `{detail}` y esta función cae al mensaje
 * por defecto. Quien llama debe pasar un `mensajePorDefecto` que sirva de
 * algo en ese caso (ver `UsuarioFormDialogComponent`). Regla del proyecto: NO se replica ninguna de esas validaciones
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
