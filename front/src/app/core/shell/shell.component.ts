import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenubarModule } from 'primeng/menubar';

import { AuthService } from '../auth/auth.service';

/**
 * Shell de navegación de la app autenticada. Es la ruta padre que envuelve
 * todas las features protegidas (`dashboard`, `catalogos/*`, `llaves`,
 * `prestamos`, `usuarios`, `reservas`, `reservas-semestrales`, `monitores`,
 * `novedades`, `notificaciones`, `disponibilidad`, `comunidad`,
 * `configuracion`, `historial`) en `app.routes.ts` — un
 * solo `authGuard` acá arriba en vez de uno repetido por hija.
 * `AuthCallbackComponent` queda deliberadamente FUERA de este shell (es la
 * pantalla de callback OAuth, sin navegación).
 *
 * Usa `p-menubar` (el módulo de barra de navegación de PrimeNG) para
 * mantener consistencia visual con el resto del sistema de diseño ya usado
 * en `features/*` (mismo set de componentes PrimeNG + `LlaveroPreset`, ver
 * `core/theme/llavero-preset.ts`). El modelo de items (`MenuItem[]`) declara
 * `routerLink` por ítem; `p-menubar` aplica internamente las directivas
 * `routerLink`/`routerLinkActive` de Angular Router para resaltar la ruta
 * activa — es el primer uso de `routerLink` en el proyecto.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, MenubarModule, ButtonModule],
  template: `
    <p-menubar [model]="items">
      <ng-template #end>
        <div class="shell-usuario">
          <span>{{ authService.currentUser()?.nombre ?? '—' }}</span>
          <button
            type="button"
            pButton
            severity="secondary"
            text
            (click)="cerrarSesion()"
          >
            Cerrar sesión
          </button>
        </div>
      </ng-template>
    </p-menubar>
    <router-outlet />
  `,
})
export class ShellComponent {
  protected readonly authService = inject(AuthService);

  protected readonly items: MenuItem[] = [
    { label: 'Dashboard', routerLink: '/dashboard' },
    {
      label: 'Catálogos',
      items: [
        { label: 'Salones', routerLink: '/catalogos/salones' },
        { label: 'Ubicaciones', routerLink: '/catalogos/ubicaciones' },
      ],
    },
    { label: 'Llaves', routerLink: '/llaves' },
    { label: 'Préstamos', routerLink: '/prestamos' },
    { label: 'Usuarios', routerLink: '/usuarios' },
    { label: 'Reservas', routerLink: '/reservas' },
    { label: 'Reservas Semestrales', routerLink: '/reservas-semestrales' },
    { label: 'Monitores', routerLink: '/monitores' },
    { label: 'Novedades', routerLink: '/novedades' },
    { label: 'Notificaciones', routerLink: '/notificaciones' },
    { label: 'Disponibilidad', routerLink: '/disponibilidad' },
    { label: 'Comunidad', routerLink: '/comunidad' },
    { label: 'Configuración', routerLink: '/configuracion' },
    { label: 'Historial', routerLink: '/historial' },
  ];

  protected async cerrarSesion(): Promise<void> {
    await this.authService.logout();
  }
}
