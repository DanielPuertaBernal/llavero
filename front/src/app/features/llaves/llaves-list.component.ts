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
 * Severidad de `p-tag` por estado: préstamo abierto es información neutra,
 * demora es una alerta que exige acción, y entregado es el cierre exitoso
 * del ciclo.
 */
const SEVERIDAD_ESTADO: Record<EstadoLlave, 'info' | 'danger' | 'success'> = {
  en_prestamo: 'info',
  demora_entrega: 'danger',
  entregado: 'success',
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
 */
@Component({
  selector: 'app-llaves-list',
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
    LlaveEntregaDialogComponent,
    LlaveDevolucionDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmdialog />

    <header class="llaves-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar por salón o persona..."
        aria-label="Buscar llave por salón o persona"
        (input)="onBusquedaChange($event)"
      />
      <p-select
        [options]="opcionesEstado"
        optionLabel="label"
        optionValue="value"
        [ngModel]="llavesService.filtroEstado()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onEstadoChange($event)"
        ariaLabel="Filtrar por estado"
        placeholder="Todas"
      />
      <p-button label="Registrar entrega" icon="pi pi-plus" (onClick)="abrirEntrega()" />
    </header>

    @if (llavesService.llaves.isError()) {
      <p role="alert">No se pudieron cargar las llaves. Intenta de nuevo.</p>
    }

    <p-table [value]="llavesFiltradas()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
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
      </ng-template>
      <ng-template #body let-llave>
        <tr>
          <td>{{ lookups.nombreSalon(llave.salon_id) }}</td>
          <td>{{ lookups.nombrePersona(llave.docente_titular_id) }}</td>
          <td>{{ lookups.nombrePersona(llave.reclamado_por_id) }}</td>
          <td>{{ etiquetaOrigen(llave.origen) }}</td>
          <td>{{ etiquetaTipoEntrega(llave.tipo_entrega) }}</td>
          <td>{{ llave.fecha_hora_entrega | date: 'dd/MM/yyyy HH:mm' }}</td>
          <td>
            <p-tag
              [severity]="severidadEstado(llave.estado)"
              [value]="etiquetaEstado(llave.estado)"
            />
          </td>
          <td>
            <p-button
              icon="pi pi-inbox"
              [text]="true"
              [disabled]="llave.estado === 'entregado'"
              (onClick)="abrirDevolucion(llave)"
              [ariaLabel]="'Registrar devolución'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="8">No hay llaves registradas para este filtro.</td>
        </tr>
      </ng-template>
    </p-table>

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

  protected severidadEstado(estado: EstadoLlave): 'info' | 'danger' | 'success' {
    return SEVERIDAD_ESTADO[estado];
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
