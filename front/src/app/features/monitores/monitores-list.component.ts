import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

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
 * NO usa `ConfirmationService.confirm`: abre
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
 * expande.
 */
@Component({
  selector: 'app-monitores-list',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    ToastModule,
    MonitorFormDialogComponent,
    MonitorDesactivacionDialogComponent,
    MonitorClasesDocenteComponent,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <header class="monitores-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar por materia..."
        aria-label="Buscar monitoría por materia"
        (input)="onBusquedaChange($event)"
      />
      <p-select
        [options]="opcionesEstado"
        optionLabel="label"
        optionValue="value"
        [ngModel]="filtroEstado()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onEstadoChange($event)"
        ariaLabel="Filtrar por estado"
        placeholder="Todos"
      />
      <p-button label="Nueva monitoría" icon="pi pi-plus" (onClick)="abrirCrear()" />
    </header>

    @if (monitoresService.monitores.isError()) {
      <p role="alert">No se pudieron cargar las monitorías. Intenta de nuevo.</p>
    }

    <p-table [value]="monitoriasFiltradas()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
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
      </ng-template>
      <ng-template #body let-monitoria let-expanded="expanded">
        <tr>
          <td>
            <p-button
              type="button"
              [pRowToggler]="monitoria"
              [text]="true"
              [icon]="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
              [ariaLabel]="'Ver clases del docente titular'"
            />
          </td>
          <td>{{ lookups.nombrePersona(monitoria.docente_titular_id) }}</td>
          <td>{{ lookups.nombrePersona(monitoria.monitor_delegado_id) }}</td>
          <td>{{ monitoria.materia }}</td>
          <td>{{ monitoria.aula ?? 'Sin aula fija' }}</td>
          <td>{{ diaLegible(monitoria) }}</td>
          <td>{{ monitoria.horario ?? 'Sin horario fijo' }}</td>
          <td>
            <p-tag
              [severity]="monitoria.activo ? 'success' : 'danger'"
              [value]="monitoria.activo ? 'Activa' : 'Inactiva'"
            />
          </td>
          <td>
            <p-button
              icon="pi pi-ban"
              severity="danger"
              [text]="true"
              [disabled]="!monitoria.activo"
              (onClick)="abrirDesactivar(monitoria)"
              [ariaLabel]="'Desactivar monitoría'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #expandedrow let-monitoria>
        <tr>
          <td colspan="9">
            <app-monitor-clases-docente [monitorId]="monitoria.id" />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="9">No hay monitorías que coincidan con el filtro.</td>
        </tr>
      </ng-template>
    </p-table>

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
      gap: var(--space-4);
      margin-bottom: var(--space-4);
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
