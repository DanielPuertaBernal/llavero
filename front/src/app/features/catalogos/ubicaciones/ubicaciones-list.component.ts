import { Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

import { extraerMensajeError } from '../catalogos-error.util';
import type { Ubicacion } from '../catalogos.models';
import { UbicacionFormDialogComponent } from './ubicacion-form-dialog.component';
import { UbicacionesService } from './ubicaciones.service';

/**
 * Vista de Ubicaciones: tabla con búsqueda por nombre y los 3 flags de
 * permiso mostrados con `p-tag` (en vez de columnas booleanas planas, para
 * que se lean de un vistazo qué operaciones autoriza cada ubicación — ver
 * `PermisosCell` en el legacy, catalogos.md §2).
 *
 * A diferencia de `UbicacionesPage` legacy (ver catalogos.md §8, "Sin
 * manejo de carga/deshabilitado"), acá SÍ se muestra un estado de error si
 * la carga inicial falla (`isError()`), no solo el spinner de `loading`.
 */
@Component({
  selector: 'app-ubicaciones-list',
  standalone: true,
  imports: [
    TableModule,
    ButtonModule,
    InputTextModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    UbicacionFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmdialog />

    <header class="ubicaciones-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar ubicación por nombre..."
        aria-label="Buscar ubicación por nombre"
        (input)="onBusquedaChange($event)"
      />
      <p-button label="Nueva ubicación" icon="pi pi-plus" (onClick)="abrirCrear()" />
    </header>

    @if (ubicacionesService.ubicaciones.isError()) {
      <p role="alert">No se pudieron cargar las ubicaciones. Intenta de nuevo.</p>
    }

    <p-table [value]="ubicacionesFiltradas()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Nombre</th>
          <th>Préstamo de llaves</th>
          <th>Devolución de llaves</th>
          <th>Préstamo de equipos</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-ubicacion>
        <tr>
          <td>{{ ubicacion.nombre }}</td>
          <td>
            <p-tag
              [severity]="ubicacion.permite_prestamo_llaves ? 'success' : 'danger'"
              [value]="ubicacion.permite_prestamo_llaves ? 'Permitido' : 'No permitido'"
            />
          </td>
          <td>
            <p-tag
              [severity]="ubicacion.permite_devolucion_llaves ? 'success' : 'danger'"
              [value]="ubicacion.permite_devolucion_llaves ? 'Permitido' : 'No permitido'"
            />
          </td>
          <td>
            <p-tag
              [severity]="ubicacion.permite_prestamo_equipos ? 'success' : 'danger'"
              [value]="ubicacion.permite_prestamo_equipos ? 'Permitido' : 'No permitido'"
            />
          </td>
          <td>
            <p-button icon="pi pi-pencil" [text]="true" (onClick)="abrirEditar(ubicacion)" [ariaLabel]="'Editar ubicación'" />
            <p-button
              icon="pi pi-trash"
              severity="danger"
              [text]="true"
              (onClick)="confirmarEliminar(ubicacion)"
              [ariaLabel]="'Eliminar ubicación'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5">No hay ubicaciones registradas.</td>
        </tr>
      </ng-template>
    </p-table>

    <app-ubicacion-form-dialog [(visible)]="formDialogVisible" [ubicacion]="ubicacionEditando()" />
  `,
  styles: `
    .ubicaciones-list__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }
  `,
})
export class UbicacionesListComponent {
  protected readonly ubicacionesService = inject(UbicacionesService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly busqueda = signal('');
  protected readonly formDialogVisible = signal(false);
  protected readonly ubicacionEditando = signal<Ubicacion | null>(null);

  protected readonly cargando = computed(() => this.ubicacionesService.ubicaciones.isPending());

  protected readonly ubicacionesFiltradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const ubicaciones = this.ubicacionesService.ubicaciones.data() ?? [];
    if (!termino) {
      return ubicaciones;
    }
    return ubicaciones.filter((ubicacion) => ubicacion.nombre.toLowerCase().includes(termino));
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected abrirCrear(): void {
    this.ubicacionEditando.set(null);
    this.formDialogVisible.set(true);
  }

  protected abrirEditar(ubicacion: Ubicacion): void {
    this.ubicacionEditando.set(ubicacion);
    this.formDialogVisible.set(true);
  }

  protected confirmarEliminar(ubicacion: Ubicacion): void {
    this.confirmationService.confirm({
      header: 'Eliminar ubicación',
      message: `¿Eliminar la ubicación "${ubicacion.nombre}"? Esta acción no se puede deshacer.`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.eliminar(ubicacion),
    });
  }

  private eliminar(ubicacion: Ubicacion): void {
    this.ubicacionesService.eliminar.mutate(ubicacion.id, {
      onSuccess: () => this.messageService.add({ severity: 'success', summary: 'Ubicación eliminada' }),
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo eliminar la ubicación',
          detail: extraerMensajeError(error, 'Intenta de nuevo.'),
        }),
    });
  }
}
