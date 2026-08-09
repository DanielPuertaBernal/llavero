import { Component, inject } from '@angular/core';

import { AuthService } from '../core/auth/auth.service';

/**
 * Placeholder de solo prueba del flujo de auth end-to-end — NO es la
 * feature `Dashboard` real (esa vive en `src/app/features/`, todavía sin
 * construir, ver `DOC/4. DiseñoTacticoDetallado/4.3 Diagrama de Paquetes.md`).
 * Se reemplaza por completo cuando se construya esa feature.
 */
@Component({
  selector: 'app-dashboard-placeholder',
  standalone: true,
  template: `
    <p>Sesión iniciada como {{ authService.currentUser()?.nombre ?? '—' }}.</p>
    <button type="button" (click)="cerrarSesion()">Cerrar sesión</button>
  `,
})
export class DashboardPlaceholderComponent {
  protected readonly authService = inject(AuthService);

  protected async cerrarSesion(): Promise<void> {
    await this.authService.logout();
  }
}
