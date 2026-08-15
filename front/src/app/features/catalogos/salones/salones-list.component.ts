import { Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';

import { extraerMensajeError } from '../catalogos-error.util';
import type { Salon } from '../catalogos.models';
import { BloquesService } from '../bloques/bloques.service';
import { TiposSilleteriaService } from '../tipos-silleteria/tipos-silleteria.service';
import { BloquesManagerComponent } from './bloques-manager.component';
import { SalonFormDialogComponent } from './salon-form-dialog.component';
import { SalonesService } from './salones.service';
import { TiposSilleteriaManagerComponent } from './tipos-silleteria-manager.component';

/**
 * Vista principal de Salones: tabla con búsqueda por nombre, creación/
 * edición vía diálogo, eliminación con confirmación previa, y acceso a los
 * catálogos de apoyo (`Bloque`/`TipoSilleteria`) desde diálogos propios.
 *
 * A diferencia del `SalonesPage.jsx` legacy (~740 líneas, ver
 * AulaSync/analisis/frontend/catalogos.md §8: "componente monolítico...
 * alta complejidad ciclomática"), este componente NO mezcla el estado de
 * las 3 entidades: solo orquesta la tabla de salones y delega bloques/
 * tipos de silletería a sus propios componentes co-localizados
 * (`BloquesManagerComponent`/`TiposSilleteriaManagerComponent`), cada uno
 * con su propio servicio de datos.
 *
 * `bloque_id`/`tipo_silleteria_id` se resuelven a nombre en el cliente
 * (join contra las listas de bloques/tipos ya cargadas) porque `SalonOut`
 * solo trae los ids, no los nombres denormalizados.
 */
@Component({
  selector: 'app-salones-list',
  standalone: true,
  imports: [
    TableModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    ToastModule,
    ConfirmDialogModule,
    SalonFormDialogComponent,
    BloquesManagerComponent,
    TiposSilleteriaManagerComponent,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmdialog />

    <header class="salones-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar salón por nombre..."
        aria-label="Buscar salón por nombre"
        (input)="onBusquedaChange($event)"
      />
      <div class="salones-list__acciones">
        <p-button label="Bloques" icon="pi pi-building" severity="secondary" (onClick)="bloquesDialogVisible.set(true)" />
        <p-button
          label="Tipos de silletería"
          icon="pi pi-list"
          severity="secondary"
          (onClick)="tiposDialogVisible.set(true)"
        />
        <p-button label="Nuevo salón" icon="pi pi-plus" (onClick)="abrirCrear()" />
      </div>
    </header>

    @if (salonesService.salones.isError()) {
      <p role="alert">No se pudieron cargar los salones. Intenta de nuevo.</p>
    }

    <p-table [value]="salonesFiltrados()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Nombre</th>
          <th>Bloque</th>
          <th>Tipo de silletería</th>
          <th>Sillas</th>
          <th>Mesas</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-salon>
        <tr>
          <td>{{ salon.nombre }}</td>
          <td>{{ nombreBloque(salon.bloque_id) }}</td>
          <td>{{ nombreTipoSilleteria(salon.tipo_silleteria_id) }}</td>
          <td>{{ salon.cantidad_sillas }}</td>
          <td>{{ salon.cantidad_mesas }}</td>
          <td>
            <p-button icon="pi pi-pencil" [text]="true" (onClick)="abrirEditar(salon)" [ariaLabel]="'Editar salón'" />
            <p-button
              icon="pi pi-trash"
              severity="danger"
              [text]="true"
              (onClick)="confirmarEliminar(salon)"
              [ariaLabel]="'Eliminar salón'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="6">No hay salones registrados.</td>
        </tr>
      </ng-template>
    </p-table>

    <app-salon-form-dialog
      [(visible)]="formDialogVisible"
      [salon]="salonEditando()"
      [bloques]="bloquesService.bloques.data() ?? []"
      [tiposSilleteria]="tiposSilleteriaService.tiposSilleteria.data() ?? []"
    />

    <p-dialog [(visible)]="bloquesDialogVisible" header="Bloques" [modal]="true" [style]="{ width: '32rem' }">
      <app-bloques-manager />
    </p-dialog>

    <p-dialog
      [(visible)]="tiposDialogVisible"
      header="Tipos de silletería"
      [modal]="true"
      [style]="{ width: '32rem' }"
    >
      <app-tipos-silleteria-manager />
    </p-dialog>
  `,
  styles: `
    .salones-list__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .salones-list__acciones {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
  `,
})
export class SalonesListComponent {
  protected readonly salonesService = inject(SalonesService);
  protected readonly bloquesService = inject(BloquesService);
  protected readonly tiposSilleteriaService = inject(TiposSilleteriaService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly busqueda = signal('');
  protected readonly formDialogVisible = signal(false);
  protected readonly salonEditando = signal<Salon | null>(null);
  protected readonly bloquesDialogVisible = signal(false);
  protected readonly tiposDialogVisible = signal(false);

  protected readonly cargando = computed(() => this.salonesService.salones.isPending());

  protected readonly salonesFiltrados = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const salones = this.salonesService.salones.data() ?? [];
    if (!termino) {
      return salones;
    }
    return salones.filter((salon) => salon.nombre.toLowerCase().includes(termino));
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected nombreBloque(bloqueId: string): string {
    return this.bloquesService.bloques.data()?.find((bloque) => bloque.id === bloqueId)?.nombre ?? '—';
  }

  protected nombreTipoSilleteria(tipoSilleteriaId: string): string {
    return (
      this.tiposSilleteriaService.tiposSilleteria
        .data()
        ?.find((tipo) => tipo.id === tipoSilleteriaId)?.nombre ?? '—'
    );
  }

  protected abrirCrear(): void {
    this.salonEditando.set(null);
    this.formDialogVisible.set(true);
  }

  protected abrirEditar(salon: Salon): void {
    this.salonEditando.set(salon);
    this.formDialogVisible.set(true);
  }

  protected confirmarEliminar(salon: Salon): void {
    this.confirmationService.confirm({
      header: 'Eliminar salón',
      message: `¿Eliminar el salón "${salon.nombre}"? Esta acción no se puede deshacer.`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.eliminar(salon),
    });
  }

  private eliminar(salon: Salon): void {
    this.salonesService.eliminar.mutate(salon.id, {
      onSuccess: () => this.messageService.add({ severity: 'success', summary: 'Salón eliminado' }),
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo eliminar el salón',
          // Ver catalogos-error.util.ts: si el salón sigue protegido por
          // llaves/reservas/programación/reservas_semestrales
          // (`on_delete=PROTECT`), el backend devuelve un 400 con un
          // mensaje claro — se muestra tal cual, sin chequeo previo del
          // lado cliente.
          detail: extraerMensajeError(error, 'Intenta de nuevo.'),
        }),
    });
  }
}
