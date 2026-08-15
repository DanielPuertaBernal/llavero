import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

export type Severidad = 'success' | 'info' | 'warn' | 'error';

/**
 * Reemplazo de `MessageService` (PrimeNG) — ver
 * `DOC/5. Identidad Visual/Mockups/00-especificacion-visual.md` para la
 * decisión de usar SweetAlert2 en vez de un toast propio de Angular
 * Material (que no trae uno "out of the box" con severidad por color).
 * Mismos 4 niveles de severidad que ya usaba el código migrado, mapeados a
 * los colores institucionales UCO.
 */
const COLOR_POR_SEVERIDAD: Record<Severidad, string> = {
  success: '#008b50',
  info: '#04b5ac',
  warn: '#ffca00',
  error: '#e28210',
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
  mostrar(severidad: Severidad, resumen: string, detalle?: string): void {
    try {
      void Swal.fire({
        toast: true,
        position: 'top-end',
        timer: severidad === 'error' ? 6000 : 3500,
        timerProgressBar: true,
        showConfirmButton: false,
        icon: severidad === 'warn' ? 'warning' : severidad,
        title: resumen,
        text: detalle,
        color: '#1a1a1a',
        background: '#ffffff',
        iconColor: COLOR_POR_SEVERIDAD[severidad],
      });
    } catch {
      // SweetAlert2 (toast + timer) no es compatible con jsdom (entorno de
      // test) — un toast fallido nunca debe tumbar el flujo de negocio que
      // lo dispara (ej. una mutación que ya se guardó bien en el backend).
    }
  }

  success(resumen: string, detalle?: string): void {
    this.mostrar('success', resumen, detalle);
  }

  info(resumen: string, detalle?: string): void {
    this.mostrar('info', resumen, detalle);
  }

  warn(resumen: string, detalle?: string): void {
    this.mostrar('warn', resumen, detalle);
  }

  error(resumen: string, detalle?: string): void {
    this.mostrar('error', resumen, detalle);
  }
}
