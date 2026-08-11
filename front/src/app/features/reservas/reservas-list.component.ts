import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

import { ReservaCancelacionDialogComponent } from './reserva-cancelacion-dialog.component';
import { ReservaFormDialogComponent } from './reserva-form-dialog.component';
import { ReservasLookupsService } from './reservas-lookups.service';
import { ReservasService } from './reservas.service';
import {
  ETIQUETAS_ESTADO_RESERVA,
  OPCIONES_ESTADO_RESERVA,
  formatearFecha,
  formatearHora,
  type EstadoReserva,
  type Reserva,
} from './reservas.models';

/**
 * Severidad de `p-tag` por estado de la reserva: una aprobada es la que está
 * vigente (información neutra), una completada es el cierre exitoso del ciclo
 * (se entregó la llave), una cancelada es un cierre deliberado (secundario) y
 * una no reclamada es la que nadie usó — el caso que el operador quiere ver
 * destacado, porque bloqueó un salón para nada.
 */
const SEVERIDAD_ESTADO: Record<EstadoReserva, 'info' | 'success' | 'secondary' | 'warn'> = {
  aprobada: 'info',
  completada: 'success',
  cancelada: 'secondary',
  no_reclamada: 'warn',
};

/**
 * Vista principal de Reservas: el tablero de reservas INDIVIDUALES de salones
 * (la reserva semestral es otro módulo del backend y será otra feature, ver
 * reservas.models.ts).
 *
 * Igual que `prestamos` y `llaves`, esta NO es un CRUD: el backend solo
 * permite crear y cancelar, así que la columna de acciones tiene un único
 * botón, "Cancelar reserva", y no hay editar ni eliminar (ver
 * back/reservas/controller.py: no existen PATCH ni DELETE).
 *
 * Nota de diseño — tres filtros, con DOS naturalezas distintas:
 *
 * - El de SOLICITANTE consulta al servidor: `GET /api/reservas/solicitante/
 *   {id}` es un endpoint propio, así que seleccionar una persona cambia la
 *   consulta (y su clave de caché) en `ReservasService`, no filtra la lista
 *   ya descargada. Ver la nota de diseño de
 *   `ReservasService.filtroSolicitante`.
 * - El de ESTADO filtra EN MEMORIA, a diferencia del filtro por estado de
 *   `prestamos`: reservas no expone un `GET /estado/{estado}` equivalente
 *   (ver back/reservas/controller.py), y no se inventa un endpoint que no
 *   existe ni se simula con parámetros de query que el controller ignoraría.
 * - El de TEXTO también filtra en el cliente, y lo hace sobre los nombres YA
 *   RESUELTOS (salón, solicitante) más el motivo — no sobre los UUID crudos
 *   que trae `ReservaIndividualOut`, que para el usuario no significan nada.
 *
 * Nota de diseño — sin fila expandible, a diferencia de `prestamos`:
 * `ReservaIndividualOut` no tiene sub-recursos (no hay `detalles` ni
 * `devoluciones` que cargar aparte), y `GET /api/reservas/{id}` devuelve
 * exactamente la misma forma que ya trae cada fila. Expandir mostraría los
 * mismos datos dos veces.
 *
 * Nota de diseño — las fechas y horas se renderizan con `formatearFecha`/
 * `formatearHora` y NO con `DatePipe`: son valores de calendario sin zona
 * (`date`/`time` del schema), y `DatePipe` los parsearía como instantes UTC,
 * mostrando el día anterior en Colombia (UTC-5). Ver reservas.models.ts.
 */
@Component({
  selector: 'app-reservas-list',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    ToastModule,
    ReservaFormDialogComponent,
    ReservaCancelacionDialogComponent,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <header class="reservas-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar por salón, solicitante o motivo..."
        aria-label="Buscar reserva por salón, solicitante o motivo"
        (input)="onBusquedaChange($event)"
      />
      <p-select
        [options]="lookups.opcionesPersonas()"
        optionLabel="label"
        optionValue="value"
        [ngModel]="reservasService.filtroSolicitante()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onSolicitanteChange($event)"
        [filter]="true"
        filterBy="label"
        [showClear]="true"
        ariaLabel="Filtrar por solicitante"
        placeholder="Todos los solicitantes"
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
      <p-button label="Registrar reserva" icon="pi pi-plus" (onClick)="abrirFormulario()" />
    </header>

    @if (reservasService.reservas.isError()) {
      <p role="alert">No se pudieron cargar las reservas. Intenta de nuevo.</p>
    }

    <p-table [value]="filtradas()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Salón</th>
          <th>Solicitante</th>
          <th>Fecha</th>
          <th>Franja</th>
          <th>Motivo</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-reserva>
        <tr>
          <td>{{ lookups.nombreSalon(reserva.salon_id) }}</td>
          <td>{{ lookups.nombrePersona(reserva.solicitante_id) }}</td>
          <td>{{ fecha(reserva) }}</td>
          <td>{{ franja(reserva) }}</td>
          <td>{{ reserva.motivo ?? '—' }}</td>
          <td>
            <p-tag
              [severity]="severidadEstado(reserva.estado)"
              [value]="etiquetaEstado(reserva.estado)"
            />
          </td>
          <td>
            <p-button
              icon="pi pi-times"
              [text]="true"
              severity="danger"
              [disabled]="reserva.estado !== 'aprobada'"
              (onClick)="abrirCancelacion(reserva)"
              [ariaLabel]="'Cancelar reserva'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="7">No hay reservas registradas para este filtro.</td>
        </tr>
      </ng-template>
    </p-table>

    <app-reserva-form-dialog [(visible)]="formDialogVisible" />
    <app-reserva-cancelacion-dialog
      [(visible)]="cancelacionDialogVisible"
      [reserva]="reservaACancelar()"
    />
  `,
})
export class ReservasListComponent {
  protected readonly reservasService = inject(ReservasService);
  protected readonly lookups = inject(ReservasLookupsService);

  protected readonly opcionesEstado: { label: string; value: EstadoReserva | null }[] = [
    { label: 'Todos', value: null },
    ...OPCIONES_ESTADO_RESERVA,
  ];

  protected readonly busqueda = signal('');
  /** `null` = sin filtro. Vive en el componente, no en el servicio: es un
   * filtro en memoria (no hay endpoint por estado). */
  protected readonly filtroEstado = signal<EstadoReserva | null>(null);
  protected readonly formDialogVisible = signal(false);
  protected readonly cancelacionDialogVisible = signal(false);
  protected readonly reservaACancelar = signal<Reserva | null>(null);

  protected readonly cargando = computed(() => this.reservasService.reservas.isPending());

  protected readonly filtradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const estado = this.filtroEstado();
    const reservas = this.reservasService.reservas.data() ?? [];

    return reservas.filter((reserva) => {
      if (estado && reserva.estado !== estado) {
        return false;
      }
      if (!termino) {
        return true;
      }
      return [
        this.lookups.nombreSalon(reserva.salon_id),
        this.lookups.nombrePersona(reserva.solicitante_id),
        reserva.motivo ?? '',
      ].some((texto) => texto.toLowerCase().includes(termino));
    });
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected onSolicitanteChange(solicitanteId: string | null): void {
    this.reservasService.filtroSolicitante.set(solicitanteId);
  }

  protected onEstadoChange(estado: EstadoReserva | null): void {
    this.filtroEstado.set(estado);
  }

  protected fecha(reserva: Reserva): string {
    return formatearFecha(reserva.fecha);
  }

  protected franja(reserva: Reserva): string {
    return `${formatearHora(reserva.hora_inicio)} — ${formatearHora(reserva.hora_fin)}`;
  }

  protected etiquetaEstado(estado: EstadoReserva): string {
    return ETIQUETAS_ESTADO_RESERVA[estado];
  }

  protected severidadEstado(estado: EstadoReserva): 'info' | 'success' | 'secondary' | 'warn' {
    return SEVERIDAD_ESTADO[estado];
  }

  protected abrirFormulario(): void {
    this.formDialogVisible.set(true);
  }

  protected abrirCancelacion(reserva: Reserva): void {
    this.reservaACancelar.set(reserva);
    this.cancelacionDialogVisible.set(true);
  }
}
