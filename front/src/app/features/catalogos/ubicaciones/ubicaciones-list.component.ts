import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ConfirmService } from '../../../core/shared/confirm.service';
import { NotificationService } from '../../../core/shared/notification.service';
import { extraerMensajeError } from '../catalogos-error.util';
import type { Ubicacion } from '../catalogos.models';
import { UbicacionFormDialogComponent } from './ubicacion-form-dialog.component';
import { UbicacionesService } from './ubicaciones.service';

/**
 * Vista de Ubicaciones: tabla con búsqueda por nombre y los 3 flags de
 * permiso mostrados con un badge propio (en vez de columnas booleanas
 * planas, para que se lean de un vistazo qué operaciones autoriza cada
 * ubicación — ver `PermisosCell` en el legacy, catalogos.md §2).
 *
 * A diferencia de `UbicacionesPage` legacy (ver catalogos.md §8, "Sin
 * manejo de carga/deshabilitado"), acá SÍ se muestra un estado de error si
 * la carga inicial falla (`isError()`), no solo el spinner de `loading`.
 *
 * Migrado de PrimeNG a Angular Material: tabla HTML simple (sin sorting/
 * paginación real) y badges propios con la paleta de estados de
 * `DOC/5. Identidad Visual/Mockups/00-especificacion-visual.md` (no hay
 * componente Material equivalente a `p-tag`).
 */
@Component({
  selector: 'app-ubicaciones-list',
  standalone: true,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, UbicacionFormDialogComponent],
  template: `
    <h1 class="uco-page-header__title">Ubicaciones</h1>
    <p class="uco-page-header__desc">Catálogo de ubicaciones y sus permisos de préstamo/devolución.</p>

    <header class="ubicaciones-list__header">
      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="text"
          placeholder="Buscar ubicación por nombre..."
          aria-label="Buscar ubicación por nombre"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>
      <button type="button" mat-raised-button color="primary" (click)="abrirCrear()">
        <mat-icon>add</mat-icon>
        Nueva ubicación
      </button>
    </header>

    @if (ubicacionesService.ubicaciones.isError()) {
      <p role="alert">No se pudieron cargar las ubicaciones. Intenta de nuevo.</p>
    }

    <table class="tabla-simple">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Préstamo de llaves</th>
          <th>Devolución de llaves</th>
          <th>Préstamo de equipos</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @if (cargando()) {
          <tr>
            <td colspan="5" class="tabla-simple__estado-vacio">Cargando...</td>
          </tr>
        } @else if (ubicacionesFiltradas().length === 0) {
          <tr>
            <td colspan="5" class="tabla-simple__estado-vacio">
              <mat-icon class="tabla-simple__estado-vacio-icono">place</mat-icon>
              <br />
              No hay ubicaciones registradas.
            </td>
          </tr>
        } @else {
          @for (ubicacion of ubicacionesFiltradas(); track ubicacion.id) {
            <tr>
              <td>{{ ubicacion.nombre }}</td>
              <td>
                <span class="badge" [class]="ubicacion.permite_prestamo_llaves ? 'badge--exito' : 'badge--peligro'">
                  {{ ubicacion.permite_prestamo_llaves ? 'Permitido' : 'No permitido' }}
                </span>
              </td>
              <td>
                <span class="badge" [class]="ubicacion.permite_devolucion_llaves ? 'badge--exito' : 'badge--peligro'">
                  {{ ubicacion.permite_devolucion_llaves ? 'Permitido' : 'No permitido' }}
                </span>
              </td>
              <td>
                <span class="badge" [class]="ubicacion.permite_prestamo_equipos ? 'badge--exito' : 'badge--peligro'">
                  {{ ubicacion.permite_prestamo_equipos ? 'Permitido' : 'No permitido' }}
                </span>
              </td>
              <td>
                <button type="button" mat-icon-button (click)="abrirEditar(ubicacion)" aria-label="Editar ubicación">
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  type="button"
                  mat-icon-button
                  class="boton-peligro"
                  (click)="confirmarEliminar(ubicacion)"
                  aria-label="Eliminar ubicación"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </tr>
          }
        }
      </tbody>
    </table>

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

    .boton-peligro {
      color: #e28210;
    }

    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 12px;
      font-family: Poppins, sans-serif;
      font-size: 11px;
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
export class UbicacionesListComponent {
  protected readonly ubicacionesService = inject(UbicacionesService);
  private readonly confirmService = inject(ConfirmService);
  private readonly notificationService = inject(NotificationService);

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

  protected async confirmarEliminar(ubicacion: Ubicacion): Promise<void> {
    const confirmado = await this.confirmService.confirmar({
      titulo: 'Eliminar ubicación',
      mensaje: `¿Eliminar la ubicación "${ubicacion.nombre}"? Esta acción no se puede deshacer.`,
      peligro: true,
      textoAceptar: 'Eliminar',
      textoCancelar: 'Cancelar',
    });
    if (confirmado) {
      this.eliminar(ubicacion);
    }
  }

  private eliminar(ubicacion: Ubicacion): void {
    this.ubicacionesService.eliminar.mutate(ubicacion.id, {
      onSuccess: () => this.notificationService.success('Ubicación eliminada'),
      onError: (error) =>
        this.notificationService.error(
          'No se pudo eliminar la ubicación',
          extraerMensajeError(error, 'Intenta de nuevo.'),
        ),
    });
  }
}
