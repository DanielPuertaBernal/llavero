import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { LlaveDevolucionDialogComponent } from './llave-devolucion-dialog.component';
import { LlaveEntregaDialogComponent } from './llave-entrega-dialog.component';
import { LlavesLookupsService } from './llaves-lookups.service';
import { LlavesService } from './llaves.service';
import {
  ETIQUETAS_ESTADO_LLAVE,
  ETIQUETAS_ORIGEN_LLAVE,
  ETIQUETAS_TIPO_ENTREGA_LLAVE,
  OPCIONES_ESTADO_LLAVE,
  type EstadoLlave,
  type Llave,
  type OrigenLlave,
  type TipoEntregaLlave,
} from './llaves.models';

/**
 * Clase de badge por estado: préstamo abierto es información neutra, demora
 * es una alerta que exige acción, y entregado es el cierre exitoso del
 * ciclo. Colores según la paleta de estados de
 * `DOC/5. Identidad Visual/Mockups/00-especificacion-visual.md`.
 */
const CLASE_BADGE_ESTADO: Record<EstadoLlave, string> = {
  en_prestamo: 'badge--info',
  demora_entrega: 'badge--peligro',
  entregado: 'badge--exito',
};

/**
 * Vista principal de Llaves: el tablero de préstamos vigentes e históricos.
 *
 * A diferencia de las vistas de `catalogos`, esta NO es un CRUD: el backend
 * solo permite crear (entrega) y cerrar (devolución) una llave, así que la
 * columna de acciones tiene un único botón, "Registrar devolución", y no
 * hay editar ni eliminar (ver back/llaves/controller.py: no existen PATCH
 * ni DELETE).
 *
 * Nota de diseño — dos filtros con naturalezas distintas:
 *
 * - El de ESTADO consulta al servidor: `GET /api/llaves/estado/{estado}` es
 *   un endpoint propio, así que seleccionar un estado cambia la consulta
 *   (y su clave de caché) en `LlavesService`, no filtra la lista ya
 *   descargada. Ver la nota de diseño de `LlavesService.filtroEstado`.
 * - El de TEXTO filtra en el cliente, y lo hace sobre los nombres YA
 *   RESUELTOS (salón, docente titular, quien reclama) — no sobre los UUID
 *   crudos que trae `LlaveOut`, que para el usuario no significan nada.
 *
 * Las 3 FKs que la tabla muestra se resuelven contra
 * `LlavesLookupsService`, con el id crudo como respaldo mientras el lookup
 * carga: la tabla nunca muestra una celda vacía.
 *
 * Migrado de PrimeNG a Angular Material: la tabla usa HTML simple (sin
 * sorting/paginación real, no aporta forzar `mat-table`); el filtro de
 * estado es un `mat-select` corto (4 opciones); los estados se muestran con
 * un badge propio (no hay componente Material equivalente a `p-tag`).
 */
@Component({
  selector: 'app-llaves-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    LlaveEntregaDialogComponent,
    LlaveDevolucionDialogComponent,
  ],
  template: `
    <header class="llaves-list__header">
      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="text"
          placeholder="Buscar por salón o persona..."
          aria-label="Buscar llave por salón o persona"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Estado</mat-label>
        <mat-select
          [ngModel]="llavesService.filtroEstado()"
          (ngModelChange)="onEstadoChange($event)"
          aria-label="Filtrar por estado"
        >
          @for (opcion of opcionesEstado; track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button type="button" mat-raised-button color="primary" (click)="abrirEntrega()">
        <mat-icon>add</mat-icon>
        Registrar entrega
      </button>
    </header>

    @if (llavesService.llaves.isError()) {
      <p role="alert">No se pudieron cargar las llaves. Intenta de nuevo.</p>
    }

    <table class="tabla-simple">
      <thead>
        <tr>
          <th>Salón</th>
          <th>Docente titular</th>
          <th>Reclamado por</th>
          <th>Origen</th>
          <th>Tipo de entrega</th>
          <th>Entregada</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @if (cargando()) {
          <tr>
            <td colspan="8" class="tabla-simple__estado-vacio">Cargando...</td>
          </tr>
        } @else if (llavesFiltradas().length === 0) {
          <tr>
            <td colspan="8" class="tabla-simple__estado-vacio">
              No hay llaves registradas para este filtro.
            </td>
          </tr>
        } @else {
          @for (llave of llavesFiltradas(); track llave.id) {
            <tr>
              <td>{{ lookups.nombreSalon(llave.salon_id) }}</td>
              <td>{{ lookups.nombrePersona(llave.docente_titular_id) }}</td>
              <td>{{ lookups.nombrePersona(llave.reclamado_por_id) }}</td>
              <td>{{ etiquetaOrigen(llave.origen) }}</td>
              <td>{{ etiquetaTipoEntrega(llave.tipo_entrega) }}</td>
              <td>{{ llave.fecha_hora_entrega | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>
                <span class="badge" [class]="claseBadgeEstado(llave.estado)">
                  {{ etiquetaEstado(llave.estado) }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  mat-icon-button
                  [disabled]="llave.estado === 'entregado'"
                  (click)="abrirDevolucion(llave)"
                  aria-label="Registrar devolución"
                >
                  <mat-icon>inbox</mat-icon>
                </button>
              </td>
            </tr>
          }
        }
      </tbody>
    </table>

    <app-llave-entrega-dialog [(visible)]="entregaDialogVisible" />
    <app-llave-devolucion-dialog [(visible)]="devolucionDialogVisible" [llave]="llaveADevolver()" />
  `,
  styles: `
    .llaves-list__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .tabla-simple {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }

    .tabla-simple th {
      background: #f5f7f6;
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 12px;
      font-weight: 700;
      color: #1a1a1a;
      text-align: left;
      padding: 10px;
    }

    .tabla-simple td {
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      padding: 10px;
    }

    .tabla-simple__estado-vacio {
      text-align: center;
      font-family: Montserrat, sans-serif;
      font-style: italic;
      color: #6b7280;
      padding: 24px;
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
export class LlavesListComponent {
  protected readonly llavesService = inject(LlavesService);
  protected readonly lookups = inject(LlavesLookupsService);

  protected readonly opcionesEstado: { label: string; value: EstadoLlave | null }[] = [
    { label: 'Todas', value: null },
    ...OPCIONES_ESTADO_LLAVE,
  ];

  protected readonly busqueda = signal('');
  protected readonly entregaDialogVisible = signal(false);
  protected readonly devolucionDialogVisible = signal(false);
  protected readonly llaveADevolver = signal<Llave | null>(null);

  protected readonly cargando = computed(() => this.llavesService.llaves.isPending());

  protected readonly llavesFiltradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const llaves = this.llavesService.llaves.data() ?? [];
    if (!termino) {
      return llaves;
    }
    return llaves.filter((llave) =>
      [
        this.lookups.nombreSalon(llave.salon_id),
        this.lookups.nombrePersona(llave.docente_titular_id),
        this.lookups.nombrePersona(llave.reclamado_por_id),
      ].some((nombre) => nombre.toLowerCase().includes(termino)),
    );
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected onEstadoChange(estado: EstadoLlave | null): void {
    this.llavesService.filtroEstado.set(estado);
  }

  protected etiquetaEstado(estado: EstadoLlave): string {
    return ETIQUETAS_ESTADO_LLAVE[estado];
  }

  protected claseBadgeEstado(estado: EstadoLlave): string {
    return CLASE_BADGE_ESTADO[estado];
  }

  protected etiquetaOrigen(origen: OrigenLlave): string {
    return ETIQUETAS_ORIGEN_LLAVE[origen];
  }

  protected etiquetaTipoEntrega(tipo: TipoEntregaLlave): string {
    return ETIQUETAS_TIPO_ENTREGA_LLAVE[tipo];
  }

  protected abrirEntrega(): void {
    this.entregaDialogVisible.set(true);
  }

  protected abrirDevolucion(llave: Llave): void {
    this.llaveADevolver.set(llave);
    this.devolucionDialogVisible.set(true);
  }
}
