import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '../auth/auth.service';
import { resolverNombreRol } from '../auth/rol-resolver';

interface GrupoNav {
  titulo: string;
  items: { label: string; ruta: string; icono: string }[];
}

/**
 * Shell de navegación de la app autenticada. Ruta padre de todas las
 * features protegidas en `app.routes.ts` (un solo `authGuard` acá arriba en
 * vez de uno repetido por hija). `AuthCallbackComponent` queda
 * deliberadamente FUERA (pantalla de callback OAuth, sin navegación).
 *
 * Sidebar colapsable (`mat-sidenav`) en vez del `p-menubar` horizontal
 * anterior — con 14 rutas hijas, un menú horizontal no escala; se sigue la
 * agrupación que ya definen los propios mockups de
 * `DOC/5. Identidad Visual/Mockups/` (01-fundacion, 02-llaves-prestamos-
 * disponibilidad, 03-reservas, 04-catalogos, 05-personas, 06-seguimiento-
 * y-sistema), y los colores/estilos literales de `00-especificacion-
 * visual.md` (fondo sidebar `#008b50`, ítem activo `#ffca00`).
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatListModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        #sidenav
        mode="side"
        opened
        class="shell__sidenav"
        [class.shell__sidenav--colapsado]="colapsado()"
      >
        <div class="shell__marca">
          <span class="shell__marca-texto">{{ colapsado() ? 'UCO' : 'Llavero UCO' }}</span>
          <button
            type="button"
            mat-icon-button
            aria-label="Colapsar u expandir el menú"
            (click)="colapsado.set(!colapsado())"
          >
            <mat-icon>{{ colapsado() ? 'chevron_right' : 'chevron_left' }}</mat-icon>
          </button>
        </div>

        <a
          mat-list-item
          routerLink="/dashboard"
          routerLinkActive="shell__item--activo"
          class="shell__item shell__item--top"
          [matTooltip]="colapsado() ? 'Dashboard' : ''"
          [attr.title]="colapsado() ? 'Dashboard' : null"
          [attr.aria-label]="colapsado() ? 'Dashboard' : null"
        >
          <mat-icon matListItemIcon>dashboard</mat-icon>
          <span matListItemTitle class="shell__item-label" [class.shell__item-label--colapsado]="colapsado()">
            Dashboard
          </span>
        </a>

        <div class="shell__perfil" [class.shell__perfil--colapsado]="colapsado()">
          <div class="shell__perfil-avatar">{{ iniciales() }}</div>
          <div class="shell__perfil-datos" [class.shell__perfil-datos--colapsado]="colapsado()">
            <span class="shell__perfil-nombre">{{ authService.currentUser()?.nombre ?? '—' }}</span>
            <span class="shell__perfil-subtitulo">{{
              authService.currentUser()?.emailInstitucional ?? ''
            }}</span>
            @if (rolNombre()) {
              <span class="shell__perfil-rol">{{ rolNombre() }}</span>
            }
          </div>
        </div>
        <div class="shell__perfil-divisor"></div>

        @for (grupo of grupos; track grupo.titulo) {
          <div class="shell__grupo-titulo" [class.shell__grupo-titulo--colapsado]="colapsado()">
            {{ grupo.titulo }}
          </div>
          @if (colapsado()) {
            <div class="shell__grupo-divisor" role="separator" [attr.aria-label]="grupo.titulo"></div>
          }
          @for (item of grupo.items; track item.ruta) {
            <a
              mat-list-item
              [routerLink]="item.ruta"
              routerLinkActive="shell__item--activo"
              class="shell__item"
              [matTooltip]="colapsado() ? item.label : ''"
              [attr.title]="colapsado() ? item.label : null"
              [attr.aria-label]="colapsado() ? item.label : null"
            >
              <mat-icon matListItemIcon>{{ item.icono }}</mat-icon>
              <span matListItemTitle class="shell__item-label" [class.shell__item-label--colapsado]="colapsado()">
                {{ item.label }}
              </span>
            </a>
          }
        }

        <div class="shell__spacer"></div>

        <div class="shell__usuario">
          @if (!colapsado()) {
            <span class="shell__usuario-nombre">{{ authService.currentUser()?.nombre ?? '—' }}</span>
          }
          <button type="button" mat-icon-button aria-label="Cerrar sesión" (click)="cerrarSesion()">
            <mat-icon>logout</mat-icon>
          </button>
        </div>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar class="shell__header"></mat-toolbar>

        <main class="shell__contenido">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell {
      height: 100vh;
    }

    .shell__sidenav {
      width: 240px;
      background: #008b50;
      color: #ffffff;
      border-right: none;
      transition: width var(--transition-layout);
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    .shell__sidenav--colapsado {
      width: 68px;
    }

    .shell__marca {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      height: 64px;
      color: #ffffff;
      font-family: Montserrat, sans-serif;
      font-weight: 700;
    }

    .shell__marca button {
      color: #ffffff;
      border-radius: var(--radius-md);
      transition: background-color var(--transition-fast);
    }

    .shell__perfil {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      overflow: hidden;
      transition: padding var(--transition-layout);
    }

    .shell__perfil--colapsado {
      padding: 12px 8px;
      justify-content: center;
    }

    .shell__perfil-avatar {
      flex: 0 0 auto;
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
      font-family: Montserrat, sans-serif;
      font-weight: 700;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .shell__perfil-datos {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
      max-width: 170px;
      opacity: 1;
      transition:
        opacity var(--transition-layout),
        max-width var(--transition-layout);
    }

    .shell__perfil-datos--colapsado {
      opacity: 0;
      max-width: 0;
    }

    .shell__perfil-nombre {
      color: #ffffff;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .shell__perfil-subtitulo {
      color: rgba(255, 255, 255, 0.65);
      font-family: Montserrat, sans-serif;
      font-size: var(--font-size-xs);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .shell__perfil-rol {
      align-self: flex-start;
      background: #024426;
      color: #e6f5ee;
      font-family: Poppins, sans-serif;
      font-size: var(--font-size-2xs);
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
      white-space: nowrap;
    }

    .shell__perfil-divisor {
      height: 1px;
      margin: 4px 16px 8px;
      background: rgba(255, 255, 255, 0.2);
    }

    .shell__grupo-titulo {
      font-family: Montserrat, sans-serif;
      font-size: var(--font-size-xs);
      font-weight: 700;
      color: #ffca00;
      padding: 16px 16px 4px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      overflow: hidden;
      white-space: nowrap;
      max-height: 32px;
      opacity: 1;
      transition:
        opacity var(--transition-layout),
        max-height var(--transition-layout),
        padding var(--transition-layout);
    }

    // Colapsado: el label de sección se desvanece (opacity/max-height, no
    // display:none) para que la animación de 300ms sea suave; se reemplaza
    // visualmente por un divisor delgado (.shell__grupo-divisor).
    .shell__grupo-titulo--colapsado {
      opacity: 0;
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    .shell__grupo-divisor {
      height: 1px;
      margin: 8px 16px;
      background: rgba(255, 255, 255, 0.2);
    }

    .shell__item {
      color: #ffffff;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      border-radius: var(--radius-md);
      transition: background-color var(--transition-fast), color var(--transition-fast);
    }

    .shell__item--top {
      margin-top: 4px;
    }

    .shell__item--activo {
      background: #ffca00;
      color: #024426;
      border-radius: var(--radius-md);
      font-weight: 600;
    }

    .shell__item-label {
      display: inline-block;
      overflow: hidden;
      white-space: nowrap;
      opacity: 1;
      max-width: 180px;
      transition:
        opacity var(--transition-layout),
        max-width var(--transition-layout);
    }

    // Colapsado: el sidebar queda solo-íconos; el label se encoge/desvanece
    // (no display:none) y el tooltip (matTooltip + title) cubre el
    // texto oculto.
    .shell__item-label--colapsado {
      opacity: 0;
      max-width: 0;
    }

    .shell__header {
      background: #ffffff;
      border-bottom: 1px solid #e2e5e4;
      color: #1a1a1a;
    }

    .shell__spacer {
      flex: 1 1 auto;
    }

    .shell__usuario {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }

    .shell__usuario-nombre {
      color: #ffffff;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shell__usuario button {
      color: #ffffff;
    }

    .shell__contenido {
      padding: 32px;
      background: #ffffff;
      min-height: calc(100vh - 64px);
    }
  `,
})
export class ShellComponent {
  protected readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  protected readonly colapsado = signal(false);

  /** Nombre legible del rol del usuario logueado, ver rol-resolver.ts. */
  protected readonly rolNombre = signal<string | null>(null);

  protected readonly iniciales = computed(() => {
    const nombre = this.authService.currentUser()?.nombre?.trim();
    if (!nombre) {
      return '—';
    }
    const partes = nombre.split(/\s+/);
    const primeras = partes.slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? '');
    return primeras.join('') || '—';
  });

  constructor() {
    effect(() => {
      const rolId = this.authService.currentUser()?.rolId;
      if (!rolId) {
        this.rolNombre.set(null);
        return;
      }
      void resolverNombreRol(this.http, rolId)
        .then((nombre) => this.rolNombre.set(nombre))
        .catch(() => this.rolNombre.set(null));
    });
  }

  protected readonly grupos: GrupoNav[] = [
    {
      titulo: 'Gestión de llaves',
      items: [
        { label: 'Llaves', ruta: '/llaves', icono: 'vpn_key' },
        { label: 'Préstamos', ruta: '/prestamos', icono: 'assignment' },
        { label: 'Disponibilidad', ruta: '/disponibilidad', icono: 'event_available' },
      ],
    },
    {
      titulo: 'Reservas',
      items: [
        { label: 'Reservas', ruta: '/reservas', icono: 'event' },
        { label: 'Reservas semestrales', ruta: '/reservas-semestrales', icono: 'date_range' },
      ],
    },
    {
      titulo: 'Catálogos',
      items: [
        { label: 'Salones', ruta: '/catalogos/salones', icono: 'meeting_room' },
        { label: 'Ubicaciones', ruta: '/catalogos/ubicaciones', icono: 'place' },
        { label: 'Programación', ruta: '/programacion', icono: 'calendar_month' },
      ],
    },
    {
      titulo: 'Personas',
      items: [
        { label: 'Usuarios', ruta: '/usuarios', icono: 'people' },
        { label: 'Comunidad', ruta: '/comunidad', icono: 'groups' },
        { label: 'Monitores', ruta: '/monitores', icono: 'supervisor_account' },
      ],
    },
    {
      titulo: 'Seguimiento',
      items: [
        { label: 'Novedades', ruta: '/novedades', icono: 'report_problem' },
        { label: 'Notificaciones', ruta: '/notificaciones', icono: 'notifications' },
        { label: 'Historial', ruta: '/historial', icono: 'history' },
      ],
    },
    {
      titulo: 'Sistema',
      items: [{ label: 'Configuración', ruta: '/configuracion', icono: 'settings' }],
    },
  ];

  protected async cerrarSesion(): Promise<void> {
    await this.authService.logout();
  }
}
