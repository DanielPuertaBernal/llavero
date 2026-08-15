import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { MonitorClasesDocenteComponent } from './monitor-clases-docente.component';
import { MonitorDesactivacionDialogComponent } from './monitor-desactivacion-dialog.component';
import { MonitorFormDialogComponent } from './monitor-form-dialog.component';
import { MonitoresLookupsService } from './monitores-lookups.service';
import { MonitoresService } from './monitores.service';
import {
  ETIQUETAS_DIA_SEMANA,
  OPCIONES_FILTRO_ESTADO_MONITOR,
  type FiltroEstadoMonitor,
  type Monitor,
} from './monitores.models';

/**
 * Vista principal de Monitores: las delegaciones docente titular -> monitor
 * delegado por materia.
 *
 * Estructuralmente es más parecida a `UsuariosListComponent` que a
 * `ReservasListComponent`/`PrestamosListComponent`: no hay ciclo de vida de
 * `estado` (solo el flag `activo` con soft-delete), pero tampoco hay edición
 * — el backend solo expone crear (`POST /api/monitores/`) y desactivar
 * (`POST /{id}/desactivar`), sin PATCH y sin DELETE (ver
 * back/monitores/controller.py). Por eso la columna de acciones tiene un
 * único botón, "Desactivar monitoría", y no hay editar.
 *
 * Nota de diseño — a diferencia de `UsuariosListComponent`, la desactivación
 * NO usa `ConfirmService.confirmar`: abre
 * `MonitorDesactivacionDialogComponent`, un diálogo propio que resume la
 * monitoría completa (docente titular, monitor delegado, materia, aula, día,
 * horario) antes de confirmar — mismo criterio que `reservas` con su
 * `ReservaCancelacionDialogComponent`. Esa elección importa más acá que en
 * `usuarios`: una fila de monitor solo se identifica por 2 UUID resueltos +
 * una materia, no por un nombre propio como el de un usuario, así que un
 * mensaje de una línea (`"¿Desactivar a X?"`) sería menos claro sobre QUÉ se
 * está desactivando.
 *
 * Nota de diseño — "Desactivar monitoría" se deshabilita en las filas ya
 * inactivas: no es duplicar una regla del backend, es no ofrecer una acción
 * que no significa nada (mismo criterio que `puedeDesactivar` en
 * `UsuariosListComponent`). A diferencia de `usuarios`, acá NO hay
 * autoprotección que revisar (una monitoría no tiene "dueño" que pueda
 * desactivarse a sí mismo) y tampoco hay "Reactivar": el backend no expone
 * ese endpoint (ver `MonitoresService`), así que no hay botón simétrico.
 *
 * Nota de diseño — filtro de estado, igual que en `usuarios`: es de CLIENTE,
 * porque el backend no expone `GET /estado/{estado}` para monitores (ver
 * back/monitores/controller.py, que solo tiene `GET /`). El de TEXTO filtra
 * por `materia`, que es el único campo propio (no resuelto vía FK) que
 * identifica a simple vista una fila para el operador.
 *
 * Nota de diseño — la fila expandible con `MonitorClasesDocenteComponent`
 * (`GET /api/monitores/{id}/clases-docente-titular`): mismo patrón que
 * `PrestamosListComponent` con `PrestamoDetallesComponent`. Da contexto real
 * del horario del docente titular sin abrir una ruta de detalle propia, y
 * solo se paga la consulta de las monitorías que el operador realmente
 * expande. Se implementa con una tabla HTML simple (no `mat-table`, que no
 * tiene un equivalente directo de fila expandible bajo demanda sin mantener
 * la fila oculta en el DOM): un signal `expandidaId` guarda a lo sumo una
 * fila expandida, y su detalle solo se renderiza (y por tanto solo dispara su
 * consulta) cuando corresponde.
 *
 * Migración PrimeNG -> Angular Material: `p-table` -> tabla HTML simple (ver
 * nota de diseño de arriba); `p-select` -> `mat-select`; `p-tag` -> badge
 * propio; `p-toast`/`MessageService` -> `NotificationService` (los diálogos
 * hijos ya migraron; esta vista no muta nada directamente).
 */
@Component({
  selector: 'app-monitores-list',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MonitorFormDialogComponent,
    MonitorDesactivacionDialogComponent,
    MonitorClasesDocenteComponent,
  ],
  template: `
    <header class="monitores-list__header">
      <mat-form-field appearance="outline" class="monitores-list__buscador">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="text"
          placeholder="Materia..."
          aria-label="Buscar monitoría por materia"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>

      <mat-form-field appearance="outline" class="monitores-list__filtro">
        <mat-label>Estado</mat-label>
        <mat-select
          [ngModel]="filtroEstado()"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="onEstadoChange($event)"
          aria-label="Filtrar por estado"
        >
          @for (opcion of opcionesEstado; track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button mat-raised-button color="primary" type="button" (click)="abrirCrear()">
        <mat-icon>add</mat-icon>
        Nueva monitoría
      </button>
    </header>

    @if (monitoresService.monitores.isError()) {
      <p role="alert">No se pudieron cargar las monitorías. Intenta de nuevo.</p>
    }

    @if (!cargando() && monitoriasFiltradas().length === 0) {
      <p class="monitores-list__vacio">No hay monitorías que coincidan con el filtro.</p>
    } @else {
      <table class="tabla-simple">
        <thead>
          <tr>
            <th></th>
            <th>Docente titular</th>
            <th>Monitor delegado</th>
            <th>Materia</th>
            <th>Aula</th>
            <th>Día</th>
            <th>Horario</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (monitoria of monitoriasFiltradas(); track monitoria.id) {
            <tr>
              <td>
                <button
                  mat-icon-button
                  type="button"
                  (click)="alternarExpandida(monitoria.id)"
                  aria-label="Ver clases del docente titular"
                >
                  <mat-icon>{{ expandidaId() === monitoria.id ? 'expand_less' : 'chevron_right' }}</mat-icon>
                </button>
              </td>
              <td>{{ lookups.nombrePersona(monitoria.docente_titular_id) }}</td>
              <td>{{ lookups.nombrePersona(monitoria.monitor_delegado_id) }}</td>
              <td>{{ monitoria.materia }}</td>
              <td>{{ monitoria.aula ?? 'Sin aula fija' }}</td>
              <td>{{ diaLegible(monitoria) }}</td>
              <td>{{ monitoria.horario ?? 'Sin horario fijo' }}</td>
              <td>
                <span class="badge" [class.badge--exito]="monitoria.activo" [class.badge--peligro]="!monitoria.activo">
                  {{ monitoria.activo ? 'Activa' : 'Inactiva' }}
                </span>
              </td>
              <td>
                <button
                  mat-icon-button
                  type="button"
                  color="warn"
                  [disabled]="!monitoria.activo"
                  (click)="abrirDesactivar(monitoria)"
                  aria-label="Desactivar monitoría"
                >
                  <mat-icon>block</mat-icon>
                </button>
              </td>
            </tr>
            @if (expandidaId() === monitoria.id) {
              <tr>
                <td colspan="9">
                  <app-monitor-clases-docente [monitorId]="monitoria.id" />
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    }

    <app-monitor-form-dialog [(visible)]="formDialogVisible" />
    <app-monitor-desactivacion-dialog
      [(visible)]="desactivacionDialogVisible"
      [monitor]="monitoriaADesactivar()"
    />
  `,
  styles: `
    .monitores-list__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4, 1rem);
      margin-bottom: var(--space-4, 1rem);
    }

    .monitores-list__buscador {
      min-width: 16rem;
    }

    .monitores-list__filtro {
      min-width: 10rem;
    }

    .tabla-simple {
      width: 100%;
      border-collapse: collapse;
    }

    .tabla-simple th {
      background: #f5f7f6;
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      color: #1a1a1a;
      text-align: left;
      padding: 0.5rem 0.75rem;
    }

    .tabla-simple td {
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 0.875rem;
      color: #1a1a1a;
      padding: 0.5rem 0.75rem;
    }

    .monitores-list__vacio {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: var(--space-4, 1rem);
    }

    .badge {
      display: inline-block;
      padding: 0.15rem 0.75rem;
      border-radius: 999px;
      font-family: Poppins, sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      color: #ffffff;
    }

    .badge--exito {
      background: #008b50;
    }

    .badge--peligro {
      background: #e28210;
    }
  `,
})
export class MonitoresListComponent {
  protected readonly monitoresService = inject(MonitoresService);
  protected readonly lookups = inject(MonitoresLookupsService);

  protected readonly opcionesEstado = OPCIONES_FILTRO_ESTADO_MONITOR;

  protected readonly busqueda = signal('');
  protected readonly filtroEstado = signal<FiltroEstadoMonitor>('todos');
  protected readonly formDialogVisible = signal(false);
  protected readonly desactivacionDialogVisible = signal(false);
  protected readonly monitoriaADesactivar = signal<Monitor | null>(null);
  protected readonly expandidaId = signal<string | null>(null);

  protected readonly cargando = computed(() => this.monitoresService.monitores.isPending());

  protected readonly monitoriasFiltradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const estado = this.filtroEstado();
    return (this.monitoresService.monitores.data() ?? [])
      .filter((monitoria) => coincideEstado(monitoria, estado))
      .filter((monitoria) => !termino || monitoria.materia.toLowerCase().includes(termino));
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected onEstadoChange(estado: FiltroEstadoMonitor): void {
    this.filtroEstado.set(estado);
  }

  protected diaLegible(monitoria: Monitor): string {
    return monitoria.dia ? ETIQUETAS_DIA_SEMANA[monitoria.dia] : 'Cualquier día con clase';
  }

  protected alternarExpandida(monitorId: string): void {
    this.expandidaId.set(this.expandidaId() === monitorId ? null : monitorId);
  }

  protected abrirCrear(): void {
    this.formDialogVisible.set(true);
  }

  protected abrirDesactivar(monitoria: Monitor): void {
    this.monitoriaADesactivar.set(monitoria);
    this.desactivacionDialogVisible.set(true);
  }
}

function coincideEstado(monitoria: Monitor, estado: FiltroEstadoMonitor): boolean {
  if (estado === 'activos') {
    return monitoria.activo;
  }
  if (estado === 'inactivos') {
    return !monitoria.activo;
  }
  return true;
}
