import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

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
 * Severidad de `p-tag` por estado del préstamo: uno activo es información
 * neutra, uno parcialmente devuelto es una advertencia (quedan equipos
 * afuera), y uno completamente devuelto es el cierre exitoso del ciclo.
 */
const SEVERIDAD_ESTADO: Record<EstadoPrestamo, 'info' | 'warn' | 'success'> = {
  activo: 'info',
  parcialmente_devuelto: 'warn',
  completamente_devuelto: 'success',
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
 */
@Component({
  selector: 'app-prestamos-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    PrestamoDetallesComponent,
    PrestamoFormDialogComponent,
    PrestamoDevolucionDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmdialog />

    <header class="prestamos-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar por solicitante, prestamista o ubicación..."
        aria-label="Buscar préstamo por solicitante, prestamista o ubicación"
        (input)="onBusquedaChange($event)"
      />
      <p-select
        [options]="opcionesEstado"
        optionLabel="label"
        optionValue="value"
        [ngModel]="prestamosService.filtroEstado()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onEstadoChange($event)"
        ariaLabel="Filtrar por estado"
        placeholder="Todos"
      />
      <p-button label="Registrar préstamo" icon="pi pi-plus" (onClick)="abrirFormulario()" />
    </header>

    @if (prestamosService.prestamos.isError()) {
      <p role="alert">No se pudieron cargar los préstamos. Intenta de nuevo.</p>
    }

    <p-table [value]="filtrados()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
        <tr>
          <th></th>
          <th>Solicitante</th>
          <th>Prestamista</th>
          <th>Ubicación</th>
          <th>Creado</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-prestamo let-expanded="expanded">
        <tr>
          <td>
            <p-button
              type="button"
              [pRowToggler]="prestamo"
              [text]="true"
              [icon]="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
              [ariaLabel]="'Ver detalle del préstamo'"
            />
          </td>
          <td>{{ lookups.nombrePersona(prestamo.solicitante_id) }}</td>
          <td>{{ lookups.nombreUsuario(prestamo.usuario_prestamista_id) }}</td>
          <td>{{ lookups.nombreUbicacion(prestamo.ubicacion_id) }}</td>
          <td>{{ prestamo.fecha_creacion | date: 'dd/MM/yyyy HH:mm' }}</td>
          <td>
            <p-tag
              [severity]="severidadEstado(prestamo.estado)"
              [value]="etiquetaEstado(prestamo.estado)"
            />
          </td>
          <td>
            <p-button
              icon="pi pi-inbox"
              [text]="true"
              [disabled]="prestamo.estado === 'completamente_devuelto'"
              (onClick)="abrirDevolucion(prestamo)"
              [ariaLabel]="'Devolver equipos'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #expandedrow let-prestamo>
        <tr>
          <td colspan="7">
            <app-prestamo-detalles [prestamoId]="prestamo.id" />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="7">No hay préstamos registrados para este filtro.</td>
        </tr>
      </ng-template>
    </p-table>

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

  protected severidadEstado(estado: EstadoPrestamo): 'info' | 'warn' | 'success' {
    return SEVERIDAD_ESTADO[estado];
  }

  protected abrirFormulario(): void {
    this.formDialogVisible.set(true);
  }

  protected abrirDevolucion(prestamo: Prestamo): void {
    this.prestamoADevolver.set(prestamo);
    this.devolucionDialogVisible.set(true);
  }
}
