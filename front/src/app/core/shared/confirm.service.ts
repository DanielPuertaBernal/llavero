import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

export interface ConfirmOptions {
  mensaje: string;
  titulo?: string;
  /** `true` para acciones irreversibles (cancelar reserva, desactivar
   * usuario, cerrar novedad) — pinta el botón de aceptar en naranja de
   * peligro (`#e28210`) en vez del verde institucional. */
  peligro?: boolean;
  textoAceptar?: string;
  textoCancelar?: string;
}

/**
 * Reemplazo de `ConfirmationService` (PrimeNG) usado hoy en cancelaciones,
 * desactivaciones y cierres (ver grep de `ConfirmationService` en
 * `features/**`). Devuelve una Promise<boolean> en vez del patrón de
 * callbacks `accept`/`reject` de PrimeNG.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  async confirmar(opciones: ConfirmOptions): Promise<boolean> {
    try {
      const resultado = await Swal.fire({
        title: opciones.titulo ?? '¿Confirmar acción?',
        text: opciones.mensaje,
        icon: opciones.peligro ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: opciones.textoAceptar ?? 'Confirmar',
        cancelButtonText: opciones.textoCancelar ?? 'Cancelar',
        confirmButtonColor: opciones.peligro ? '#e28210' : '#008b50',
        cancelButtonColor: '#6b7280',
        reverseButtons: true,
      });
      return resultado.isConfirmed;
    } catch {
      // Mismo caso que NotificationService: SweetAlert2 puede fallar bajo
      // jsdom (test). Ante un diálogo de confirmación que no pudo mostrarse,
      // el default seguro es NO proceder con la acción (más aún si es
      // irreversible) — nunca asumir que el usuario confirmó.
      return false;
    }
  }
}
