import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ConfirmService } from '../../../core/shared/confirm.service';
import { NotificationService } from '../../../core/shared/notification.service';
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
 *
 * Migrado de PrimeNG a Angular Material: tabla HTML simple (sin sorting/
 * paginación real), y los diálogos de "Bloques"/"Tipos de silletería" usan
 * las directivas reales de `MatDialogModule` dentro de un overlay
 * condicional, mismo criterio que `SalonFormDialogComponent`.
 */
@Component({
  selector: 'app-salones-list',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    SalonFormDialogComponent,
    BloquesManagerComponent,
    TiposSilleteriaManagerComponent,
  ],
  template: `
    <h1 class="uco-page-header__title">Salones</h1>
    <p class="uco-page-header__desc">Catálogo de salones, con su bloque y tipo de silletería.</p>

    <header class="salones-list__header">
      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="text"
          placeholder="Buscar salón por nombre..."
          aria-label="Buscar salón por nombre"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>
      <div class="salones-list__acciones">
        <button type="button" mat-stroked-button (click)="bloquesDialogVisible.set(true)">
          <mat-icon>apartment</mat-icon>
          Bloques
        </button>
        <button type="button" mat-stroked-button (click)="tiposDialogVisible.set(true)">
          <mat-icon>list</mat-icon>
          Tipos de silletería
        </button>
        <button type="button" mat-raised-button color="primary" (click)="abrirCrear()">
          <mat-icon>add</mat-icon>
          Nuevo salón
        </button>
      </div>
    </header>

    @if (salonesService.salones.isError()) {
      <p role="alert">No se pudieron cargar los salones. Intenta de nuevo.</p>
    }

    <table class="tabla-simple">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Bloque</th>
          <th>Tipo de silletería</th>
          <th>Sillas</th>
          <th>Mesas</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @if (cargando()) {
          <tr>
            <td colspan="6" class="tabla-simple__estado-vacio">Cargando...</td>
          </tr>
        } @else if (salonesFiltrados().length === 0) {
          <tr>
            <td colspan="6" class="tabla-simple__estado-vacio">
              <mat-icon class="tabla-simple__estado-vacio-icono">meeting_room</mat-icon>
              <br />
              No hay salones registrados.
            </td>
          </tr>
        } @else {
          @for (salon of salonesFiltrados(); track salon.id) {
            <tr>
              <td>{{ salon.nombre }}</td>
              <td>{{ nombreBloque(salon.bloque_id) }}</td>
              <td>{{ nombreTipoSilleteria(salon.tipo_silleteria_id) }}</td>
              <td>{{ salon.cantidad_sillas }}</td>
              <td>{{ salon.cantidad_mesas }}</td>
              <td>
                <button type="button" mat-icon-button (click)="abrirEditar(salon)" aria-label="Editar salón">
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  type="button"
                  mat-icon-button
                  class="boton-peligro"
                  (click)="confirmarEliminar(salon)"
                  aria-label="Eliminar salón"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </tr>
          }
        }
      </tbody>
    </table>

    <app-salon-form-dialog
      [(visible)]="formDialogVisible"
      [salon]="salonEditando()"
      [bloques]="bloquesService.bloques.data() ?? []"
      [tiposSilleteria]="tiposSilleteriaService.tiposSilleteria.data() ?? []"
    />

    @if (bloquesDialogVisible()) {
      <div class="dialogo__overlay" (click)="bloquesDialogVisible.set(false)">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bloques-dialogo-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="bloques-dialogo-titulo">Bloques</h2>
          <mat-dialog-content>
            <app-bloques-manager />
          </mat-dialog-content>
          <mat-dialog-actions align="end">
            <button type="button" mat-stroked-button (click)="bloquesDialogVisible.set(false)">Cerrar</button>
          </mat-dialog-actions>
        </div>
      </div>
    }

    @if (tiposDialogVisible()) {
      <div class="dialogo__overlay" (click)="tiposDialogVisible.set(false)">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tipos-dialogo-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="tipos-dialogo-titulo">Tipos de silletería</h2>
          <mat-dialog-content>
            <app-tipos-silleteria-manager />
          </mat-dialog-content>
          <mat-dialog-actions align="end">
            <button type="button" mat-stroked-button (click)="tiposDialogVisible.set(false)">Cerrar</button>
          </mat-dialog-actions>
        </div>
      </div>
    }
  `,
  styles: `
    .salones-list__header {
      display: flex;
      flex-wrap: wrap;
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

    .boton-peligro {
      color: #e28210;
    }

    .dialogo__overlay {
      position: fixed;
      inset: 0;
      background: rgba(26, 26, 26, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialogo__panel {
      background: #ffffff;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-elevated);
      width: 32rem;
      max-width: 92vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4);
    }
  `,
})
export class SalonesListComponent {
  protected readonly salonesService = inject(SalonesService);
  protected readonly bloquesService = inject(BloquesService);
  protected readonly tiposSilleteriaService = inject(TiposSilleteriaService);
  private readonly confirmService = inject(ConfirmService);
  private readonly notificationService = inject(NotificationService);

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

  protected async confirmarEliminar(salon: Salon): Promise<void> {
    const confirmado = await this.confirmService.confirmar({
      titulo: 'Eliminar salón',
      mensaje: `¿Eliminar el salón "${salon.nombre}"? Esta acción no se puede deshacer.`,
      peligro: true,
      textoAceptar: 'Eliminar',
      textoCancelar: 'Cancelar',
    });
    if (confirmado) {
      this.eliminar(salon);
    }
  }

  private eliminar(salon: Salon): void {
    this.salonesService.eliminar.mutate(salon.id, {
      onSuccess: () => this.notificationService.success('Salón eliminado'),
      onError: (error) =>
        // Ver catalogos-error.util.ts: si el salón sigue protegido por
        // llaves/reservas/programación/reservas_semestrales
        // (`on_delete=PROTECT`), el backend devuelve un 400 con un
        // mensaje claro — se muestra tal cual, sin chequeo previo del
        // lado cliente.
        this.notificationService.error(
          'No se pudo eliminar el salón',
          extraerMensajeError(error, 'Intenta de nuevo.'),
        ),
    });
  }
}
