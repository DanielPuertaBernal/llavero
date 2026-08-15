import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { SkeletonComponent } from '../../core/shared/skeleton.component';
import { PrestamoDetallesComponent } from './prestamo-detalles.component';
import { PrestamoDevolucionDialogComponent } from './prestamo-devolucion-dialog.component';
import { PrestamoFormDialogComponent } from './prestamo-form-dialog.component';
import { PrestamosLookupsService } from './prestamos-lookups.service';
import { PrestamosService } from './prestamos.service';
import {
  ETIQUETAS_ESTADO_PRESTAMO,
  OPCIONES_ESTADO_PRESTAMO,
  type EstadoPrestamo,
  type Prestamo,
} from './prestamos.models';

/**
 * Clase de badge por estado del préstamo: uno activo es información
 * neutra, uno parcialmente devuelto es una advertencia (quedan equipos
 * afuera), y uno completamente devuelto es el cierre exitoso del ciclo.
 */
const CLASE_BADGE_ESTADO: Record<EstadoPrestamo, string> = {
  activo: 'badge--info',
  parcialmente_devuelto: 'badge--atencion',
  completamente_devuelto: 'badge--exito',
};

/**
 * Vista principal de Préstamos: el tablero de préstamos de equipos vigentes
 * e históricos.
 *
 * A diferencia de las vistas de `catalogos`, esta NO es un CRUD: el backend
 * solo permite crear (el préstamo con sus N equipos) y devolver equipos, así
 * que la columna de acciones tiene un único botón, "Devolver equipos", y no
 * hay editar ni eliminar (ver back/prestamos/controller.py: no existen PATCH
 * ni DELETE).
 *
 * Nota de diseño — dos filtros con naturalezas distintas:
 *
 * - El de ESTADO consulta al servidor: `GET /api/prestamos/estado/{estado}`
 *   es un endpoint propio, así que seleccionar un estado cambia la consulta
 *   (y su clave de caché) en `PrestamosService`, no filtra la lista ya
 *   descargada. Ver la nota de diseño de `PrestamosService.filtroEstado`.
 * - El de TEXTO filtra en el cliente, y lo hace sobre los nombres YA
 *   RESUELTOS (solicitante, prestamista, ubicación) — no sobre los UUID
 *   crudos que trae `PrestamoOut`, que para el usuario no significan nada.
 *
 * Nota de diseño — la fila expandible: `PrestamoOut` no trae ni los equipos
 * ni las devoluciones (son dos endpoints aparte). En vez de una vista de
 * detalle con su propia ruta, cada fila se expande y monta
 * `app-prestamo-detalles`, que carga ese detalle bajo demanda: el listado
 * arranca con una sola petición y solo se paga el detalle de los préstamos
 * que el usuario realmente abre.
 *
 * Migrado de PrimeNG a Angular Material: la tabla usa HTML simple con el
 * mismo patrón de fila expandible reimplementado a mano (un `Set<string>`
 * de ids expandidos), ya que `mat-table` no trae un equivalente directo a
 * `pRowToggler`/`expandedrow` de `p-table`.
 */
@Component({
  selector: 'app-prestamos-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    PrestamoDetallesComponent,
    PrestamoFormDialogComponent,
    PrestamoDevolucionDialogComponent,
    SkeletonComponent,
  ],
  template: `
    <h1 class="uco-page-header__title">Préstamos</h1>
    <p class="uco-page-header__desc">Préstamos y devoluciones de equipos.</p>

    <header class="prestamos-list__header">
      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="text"
          placeholder="Buscar por solicitante, prestamista o ubicación..."
          aria-label="Buscar préstamo por solicitante, prestamista o ubicación"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Estado</mat-label>
        <mat-select
          [ngModel]="prestamosService.filtroEstado()"
          (ngModelChange)="onEstadoChange($event)"
          aria-label="Filtrar por estado"
        >
          @for (opcion of opcionesEstado; track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button type="button" mat-raised-button color="primary" (click)="abrirFormulario()">
        <mat-icon>add</mat-icon>
        Registrar préstamo
      </button>
    </header>

    @if (prestamosService.prestamos.isError()) {
      <p role="alert">No se pudieron cargar los préstamos. Intenta de nuevo.</p>
    }

    @if (cargando()) {
      <div class="prestamos-list__skeleton" aria-hidden="true">
        @for (fila of [1, 2, 3, 4, 5]; track fila) {
          <app-skeleton variant="row" />
        }
      </div>
    } @else {
    <table class="tabla-simple">
      <thead>
        <tr>
          <th></th>
          <th>Solicitante</th>
          <th>Prestamista</th>
          <th>Ubicación</th>
          <th>Creado</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @if (filtrados().length === 0) {
          <tr>
            <td colspan="7" class="tabla-simple__estado-vacio">
              <mat-icon class="tabla-simple__estado-vacio-icono">assignment</mat-icon>
              <br />
              No hay préstamos registrados para este filtro.
            </td>
          </tr>
        } @else {
          @for (prestamo of filtrados(); track prestamo.id) {
            <tr>
              <td>
                <button
                  type="button"
                  mat-icon-button
                  (click)="alternarExpandido(prestamo.id)"
                  aria-label="Ver detalle del préstamo"
                >
                  <mat-icon>{{ expandido(prestamo.id) ? 'expand_more' : 'chevron_right' }}</mat-icon>
                </button>
              </td>
              <td>{{ lookups.nombrePersona(prestamo.solicitante_id) }}</td>
              <td>{{ lookups.nombreUsuario(prestamo.usuario_prestamista_id) }}</td>
              <td>{{ lookups.nombreUbicacion(prestamo.ubicacion_id) }}</td>
              <td>{{ prestamo.fecha_creacion | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>
                <span class="badge" [class]="claseBadgeEstado(prestamo.estado)">
                  {{ etiquetaEstado(prestamo.estado) }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  mat-icon-button
                  [disabled]="prestamo.estado === 'completamente_devuelto'"
                  (click)="abrirDevolucion(prestamo)"
                  aria-label="Devolver equipos"
                >
                  <mat-icon>inbox</mat-icon>
                </button>
              </td>
            </tr>
            @if (expandido(prestamo.id)) {
              <tr>
                <td colspan="7">
                  <app-prestamo-detalles [prestamoId]="prestamo.id" />
                </td>
              </tr>
            }
          }
        }
      </tbody>
    </table>
    }

    <app-prestamo-form-dialog [(visible)]="formDialogVisible" />
    <app-prestamo-devolucion-dialog
      [(visible)]="devolucionDialogVisible"
      [prestamo]="prestamoADevolver()"
    />
  `,
  styles: `
    .prestamos-list__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .prestamos-list__skeleton {
      border: 1px solid #e2e5e4;
      border-radius: var(--radius-md);
      padding: var(--space-3);
      background: #ffffff;
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

    .badge--info {
      background: #04b5ac;
    }

    .badge--atencion {
      background: #ffca00;
      color: #1a1a1a;
    }

    .badge--peligro {
      background: #e28210;
    }
  `,
})
export class PrestamosListComponent {
  protected readonly prestamosService = inject(PrestamosService);
  protected readonly lookups = inject(PrestamosLookupsService);

  protected readonly opcionesEstado: { label: string; value: EstadoPrestamo | null }[] = [
    { label: 'Todos', value: null },
    ...OPCIONES_ESTADO_PRESTAMO,
  ];

  protected readonly busqueda = signal('');
  protected readonly formDialogVisible = signal(false);
  protected readonly devolucionDialogVisible = signal(false);
  protected readonly prestamoADevolver = signal<Prestamo | null>(null);
  private readonly idsExpandidos = signal<ReadonlySet<string>>(new Set());

  protected readonly cargando = computed(() => this.prestamosService.prestamos.isPending());

  protected readonly filtrados = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const prestamos = this.prestamosService.prestamos.data() ?? [];
    if (!termino) {
      return prestamos;
    }
    return prestamos.filter((prestamo) =>
      [
        this.lookups.nombrePersona(prestamo.solicitante_id),
        this.lookups.nombreUsuario(prestamo.usuario_prestamista_id),
        this.lookups.nombreUbicacion(prestamo.ubicacion_id),
      ].some((nombre) => nombre.toLowerCase().includes(termino)),
    );
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected onEstadoChange(estado: EstadoPrestamo | null): void {
    this.prestamosService.filtroEstado.set(estado);
  }

  protected etiquetaEstado(estado: EstadoPrestamo): string {
    return ETIQUETAS_ESTADO_PRESTAMO[estado];
  }

  protected claseBadgeEstado(estado: EstadoPrestamo): string {
    return CLASE_BADGE_ESTADO[estado];
  }

  protected expandido(id: string): boolean {
    return this.idsExpandidos().has(id);
  }

  protected alternarExpandido(id: string): void {
    const siguiente = new Set(this.idsExpandidos());
    if (siguiente.has(id)) {
      siguiente.delete(id);
    } else {
      siguiente.add(id);
    }
    this.idsExpandidos.set(siguiente);
  }

  protected abrirFormulario(): void {
    this.formDialogVisible.set(true);
  }

  protected abrirDevolucion(prestamo: Prestamo): void {
    this.prestamoADevolver.set(prestamo);
    this.devolucionDialogVisible.set(true);
  }
}
