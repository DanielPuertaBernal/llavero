import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { SkeletonComponent } from '../../core/shared/skeleton.component';
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
 * Clase de badge por estado de la reserva (ver
 * `DOC/5. Identidad Visual/Mockups/00-especificacion-visual.md`, tabla de
 * paleta de estados): una aprobada es la que está vigente (info/turquesa),
 * una completada es el cierre exitoso del ciclo (éxito/verde, se entregó la
 * llave), una cancelada es un cierre deliberado (neutro/azul) y una no
 * reclamada es la que nadie usó — el caso que el operador quiere ver
 * destacado (atención/amarillo), porque bloqueó un salón para nada.
 */
const CLASE_BADGE_ESTADO: Record<EstadoReserva, string> = {
  aprobada: 'badge badge--info',
  completada: 'badge badge--exito',
  cancelada: 'badge badge--neutro',
  no_reclamada: 'badge badge--atencion',
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
 * - El de SOLICITANTE y el de ESTADO consultan al servidor: `GET /api/
 *   reservas/solicitante/{id}` y `GET /api/reservas/estado/{estado}` son
 *   endpoints propios (este último ya replicando el patrón de `prestamos`),
 *   así que elegirlos cambia la consulta (y su clave de caché) en
 *   `ReservasService`, no filtran la lista ya descargada. Ver la nota de
 *   diseño de `ReservasService.filtroSolicitante`/`filtroEstado`.
 *
 *   Los dos selects son mutuamente excluyentes: `onSolicitanteChange` limpia
 *   `filtroEstado` y `onEstadoChange` limpia `filtroSolicitante`, porque el
 *   backend no expone un endpoint combinado solicitante+estado y
 *   `ReservasService.reservas` solo puede alimentarse de uno de los dos a la
 *   vez (ver la Nota de diseño de precedencia en `reservas.service.ts`).
 * - El de TEXTO filtra en el cliente, y lo hace sobre los nombres YA
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
 *
 * Migración PrimeNG -> Angular Material: `p-table` -> `<table mat-table>`
 * (misma estructura `tbody > tr`, así que los selectores de test no
 * cambiaron), `p-select` -> `mat-select`, `p-tag` -> badge propio (Material
 * no trae un componente de pastilla de estado; se define la clase
 * `.badge--*` según la paleta de estados del spec visual), `p-toast`/
 * `MessageService` -> `NotificationService` (SweetAlert2).
 */
@Component({
  selector: 'app-reservas-list',
  standalone: true,
  imports: [
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReservaFormDialogComponent,
    ReservaCancelacionDialogComponent,
    SkeletonComponent,
  ],
  template: `
    <h1 class="uco-page-header__title">Reservas</h1>
    <p class="uco-page-header__desc">Reservas individuales de salones.</p>

    <header class="reservas-list__header">
      <mat-form-field appearance="outline" class="reservas-list__buscador">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="text"
          placeholder="Salón, solicitante o motivo..."
          aria-label="Buscar reserva por salón, solicitante o motivo"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>

      <mat-form-field appearance="outline" class="reservas-list__filtro">
        <mat-label>Solicitante</mat-label>
        <mat-select
          [ngModel]="reservasService.filtroSolicitante()"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="onSolicitanteChange($event)"
          aria-label="Filtrar por solicitante"
        >
          <mat-option [value]="null">Todos los solicitantes</mat-option>
          @for (opcion of lookups.opcionesPersonas(); track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="reservas-list__filtro">
        <mat-label>Estado</mat-label>
        <mat-select
          [ngModel]="reservasService.filtroEstado()"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="onEstadoChange($event)"
          aria-label="Filtrar por estado"
        >
          @for (opcion of opcionesEstado; track opcion.value ?? 'todos') {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button mat-raised-button color="primary" type="button" (click)="abrirFormulario()">
        <mat-icon>add</mat-icon>
        Registrar reserva
      </button>
    </header>

    @if (reservasService.reservas.isError()) {
      <p role="alert">No se pudieron cargar las reservas. Intenta de nuevo.</p>
    }

    @if (cargando()) {
      <div class="reservas-list__skeleton" aria-hidden="true">
        @for (fila of [1, 2, 3, 4, 5]; track fila) {
          <app-skeleton variant="row" />
        }
      </div>
    } @else {
    <table mat-table [dataSource]="filtradas()" class="reservas-list__tabla">
      <ng-container matColumnDef="salon">
        <th mat-header-cell *matHeaderCellDef>Salón</th>
        <td mat-cell *matCellDef="let reserva">{{ lookups.nombreSalon(reserva.salon_id) }}</td>
      </ng-container>

      <ng-container matColumnDef="solicitante">
        <th mat-header-cell *matHeaderCellDef>Solicitante</th>
        <td mat-cell *matCellDef="let reserva">
          {{ lookups.nombrePersona(reserva.solicitante_id) }}
        </td>
      </ng-container>

      <ng-container matColumnDef="fecha">
        <th mat-header-cell *matHeaderCellDef>Fecha</th>
        <td mat-cell *matCellDef="let reserva">{{ fecha(reserva) }}</td>
      </ng-container>

      <ng-container matColumnDef="franja">
        <th mat-header-cell *matHeaderCellDef>Franja</th>
        <td mat-cell *matCellDef="let reserva">{{ franja(reserva) }}</td>
      </ng-container>

      <ng-container matColumnDef="motivo">
        <th mat-header-cell *matHeaderCellDef>Motivo</th>
        <td mat-cell *matCellDef="let reserva">{{ reserva.motivo ?? '—' }}</td>
      </ng-container>

      <ng-container matColumnDef="estado">
        <th mat-header-cell *matHeaderCellDef>Estado</th>
        <td mat-cell *matCellDef="let reserva">
          <span [class]="claseBadgeEstado(reserva.estado)">{{ etiquetaEstado(reserva.estado) }}</span>
        </td>
      </ng-container>

      <ng-container matColumnDef="acciones">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let reserva">
          <button
            mat-icon-button
            type="button"
            color="warn"
            [disabled]="reserva.estado !== 'aprobada'"
            (click)="abrirCancelacion(reserva)"
            aria-label="Cancelar reserva"
          >
            <mat-icon>close</mat-icon>
          </button>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="columnas"></tr>
      <tr mat-row *matRowDef="let row; columns: columnas"></tr>
    </table>

    @if (filtradas().length === 0) {
      <p class="reservas-list__vacio">
        <mat-icon class="reservas-list__vacio-icono">event</mat-icon>
        <br />
        No hay reservas registradas para este filtro.
      </p>
    }
    }

    <app-reserva-form-dialog [(visible)]="formDialogVisible" />
    <app-reserva-cancelacion-dialog
      [(visible)]="cancelacionDialogVisible"
      [reserva]="reservaACancelar()"
    />
  `,
  styles: `
    .reservas-list__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4, 1rem);
      margin-bottom: var(--space-4, 1rem);
    }

    .reservas-list__buscador {
      min-width: 16rem;
    }

    .reservas-list__filtro {
      min-width: 12rem;
    }

    .reservas-list__tabla {
      width: 100%;
    }

    .reservas-list__skeleton {
      border: 1px solid #e2e5e4;
      border-radius: var(--radius-md);
      padding: var(--space-3);
      background: #ffffff;
    }

    .reservas-list__vacio {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: var(--space-4, 1rem);
    }

    .reservas-list__vacio-icono {
      color: #9ca3af;
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 4px;
    }

    .badge {
      display: inline-block;
      padding: 0.15rem 0.75rem;
      border-radius: 999px;
      font-family: Poppins, sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      color: #ffffff;
    }

    .badge--info {
      background: #04b5ac;
    }

    .badge--exito {
      background: #008b50;
    }

    .badge--neutro {
      background: #1d3475;
    }

    .badge--atencion {
      background: #ffca00;
      color: #1a1a1a;
    }
  `,
})
export class ReservasListComponent {
  protected readonly reservasService = inject(ReservasService);
  protected readonly lookups = inject(ReservasLookupsService);

  protected readonly columnas = [
    'salon',
    'solicitante',
    'fecha',
    'franja',
    'motivo',
    'estado',
    'acciones',
  ];

  protected readonly opcionesEstado: { label: string; value: EstadoReserva | null }[] = [
    { label: 'Todos', value: null },
    ...OPCIONES_ESTADO_RESERVA,
  ];

  protected readonly busqueda = signal('');
  protected readonly formDialogVisible = signal(false);
  protected readonly cancelacionDialogVisible = signal(false);
  protected readonly reservaACancelar = signal<Reserva | null>(null);

  protected readonly cargando = computed(() => this.reservasService.reservas.isPending());

  protected readonly filtradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const reservas = this.reservasService.reservas.data() ?? [];

    if (!termino) {
      return reservas;
    }
    return reservas.filter((reserva) =>
      [
        this.lookups.nombreSalon(reserva.salon_id),
        this.lookups.nombrePersona(reserva.solicitante_id),
        reserva.motivo ?? '',
      ].some((texto) => texto.toLowerCase().includes(termino)),
    );
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected onSolicitanteChange(solicitanteId: string | null): void {
    this.reservasService.filtroSolicitante.set(solicitanteId);
    this.reservasService.filtroEstado.set(null);
  }

  protected onEstadoChange(estado: EstadoReserva | null): void {
    this.reservasService.filtroEstado.set(estado);
    this.reservasService.filtroSolicitante.set(null);
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

  protected claseBadgeEstado(estado: EstadoReserva): string {
    return CLASE_BADGE_ESTADO[estado];
  }

  protected abrirFormulario(): void {
    this.formDialogVisible.set(true);
  }

  protected abrirCancelacion(reserva: Reserva): void {
    this.reservaACancelar.set(reserva);
    this.cancelacionDialogVisible.set(true);
  }
}
