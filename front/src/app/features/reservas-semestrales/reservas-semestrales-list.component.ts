import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ReservaSemestralCancelacionDialogComponent } from './reserva-semestral-cancelacion-dialog.component';
import { ReservaSemestralFormDialogComponent } from './reserva-semestral-form-dialog.component';
import { ReservasSemestralesLookupsService } from './reservas-semestrales-lookups.service';
import { ReservasSemestralesService } from './reservas-semestrales.service';
import { ETIQUETAS_DIA_SEMANA, formatearHora, type ReservaSemestral } from './reservas-semestrales.models';

/** Un grupo de franjas que comparten `grupo_id` (mismo salón, solicitante y
 * semestre), ya con los campos compartidos resueltos a texto legible. Es la
 * unidad que renderiza cada bloque de la tabla. */
interface GrupoFilas {
  grupoId: string;
  salon: string;
  solicitante: string;
  semestre: string;
  franjas: ReservaSemestral[];
}

/**
 * Vista principal de Reservas Semestrales: el tablero de franjas horarias
 * RECURRENTES semanales de salones (la reserva individual, de un solo día, es
 * otro módulo del backend y es la feature `features/reservas`).
 *
 * Igual que `reservas`, esta NO es un CRUD: el backend solo permite crear un
 * grupo de franjas y cancelarlo completo, así que la columna de acciones
 * tiene un único botón y no hay editar ni eliminar franja por franja (ver
 * back/reservas_semestrales/controller.py: no existen PATCH ni DELETE, y
 * "cancelar" es un DELETE real de todas las filas del grupo).
 *
 * Nota de diseño — agrupamiento visual por `grupo_id`, no fila expandible:
 * a diferencia de `prestamos` (donde el detalle de equipos/devoluciones vive
 * en OTRO endpoint y se carga bajo demanda al expandir), acá
 * `ReservaSemestralOut` ya trae TODOS los campos en cada fila — no hay nada
 * que cargar aparte. Lo único que cambia entre las franjas de un mismo grupo
 * es `dia`/`hora_inicio`/`hora_fin`; salón, solicitante, semestre y
 * `grupo_id` se repiten. Angular Material no tiene un `rowGroupMode=
 * "subheader"` como PrimeNG, así que la agrupación se arma acá con
 * `computed` (`grupos`) y se recorre con una tabla HTML simple en vez de
 * `mat-table`: cada grupo aporta una fila de sub-cabecera (salón, solicitante,
 * semestre) y una fila por franja debajo.
 *
 * Nota de diseño — el botón "Cancelar grupo" vive en cada fila de FRANJA (no
 * en la sub-cabecera): visualmente pertenece a la franja donde el operador
 * puso el cursor, pero dispara la cancelación del GRUPO completo
 * (`abrirCancelacion` recolecta todas las franjas que comparten `grupo_id`
 * con la fila clicada, no solo esa fila) — el diálogo de confirmación deja
 * clarísimo que se eliminan todas. Queda deshabilitado si esa franja tiene
 * `creado_manualmente=false`: el backend rechaza con 400 la cancelación de
 * CUALQUIER grupo que tenga una sola franja cargada institucionalmente (ver
 * el docstring de back/reservas_semestrales/controller.py), y las franjas de
 * un mismo grupo comparten ese flag por venir del mismo lote de creación.
 *
 * Nota de diseño — filtro de texto en memoria, igual que en `reservas`: filtra
 * sobre los nombres YA RESUELTOS (salón, solicitante, código de semestre) y el
 * día, no sobre los UUID crudos. No hay filtro por solicitante contra el
 * servidor: el backend no expone ese endpoint para esta feature (ver la nota
 * de diseño de `ReservasSemestralesService`).
 *
 * Nota de diseño — sin columna "Estado" ni badge de severidad por estado, a
 * diferencia de `reservas`: `ReservaSemestral` no tiene esa columna (ver
 * reservas-semestrales.models.ts). El único badge acá distingue origen
 * (manual/institucional), no ciclo de vida.
 *
 * Migración PrimeNG -> Angular Material: `p-table` (con `rowGroupMode`) ->
 * tabla HTML simple con agrupamiento propio (ver nota de diseño arriba);
 * `p-tag` -> badge propio; `MessageService`/`p-toast` -> `NotificationService`
 * (no se usa acá directamente, pero los diálogos hijos ya migraron).
 */
@Component({
  selector: 'app-reservas-semestrales-list',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    ReservaSemestralFormDialogComponent,
    ReservaSemestralCancelacionDialogComponent,
  ],
  template: `
    <header class="reservas-semestrales-list__header">
      <mat-form-field appearance="outline" class="reservas-semestrales-list__buscador">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="text"
          placeholder="Salón, solicitante, semestre o día..."
          aria-label="Buscar reserva semestral por salón, solicitante, semestre o día"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>

      <button mat-raised-button color="primary" type="button" (click)="abrirFormulario()">
        <mat-icon>add</mat-icon>
        Registrar reserva semestral
      </button>
    </header>

    @if (reservasSemestralesService.reservas.isError()) {
      <p role="alert">No se pudieron cargar las reservas semestrales. Intenta de nuevo.</p>
    }

    @if (!cargando() && grupos().length === 0) {
      <p class="reservas-semestrales-list__vacio">
        No hay reservas semestrales registradas para este filtro.
      </p>
    } @else {
      <table class="tabla-simple">
        <thead>
          <tr>
            <th>Día</th>
            <th>Franja</th>
            <th>Origen</th>
            <th></th>
          </tr>
        </thead>
        @for (grupo of grupos(); track grupo.grupoId) {
          <tbody>
            <tr class="reservas-semestrales-list__grupo-header">
              <td colspan="4">
                <strong>{{ grupo.salon }}</strong>
                — {{ grupo.solicitante }}
                — {{ grupo.semestre }}
              </td>
            </tr>
            @for (franjaFila of grupo.franjas; track franjaFila.id) {
              <tr>
                <td>{{ etiquetaDia(franjaFila.dia) }}</td>
                <td>{{ franja(franjaFila) }}</td>
                <td>
                  <span class="badge" [class.badge--info]="franjaFila.creado_manualmente" [class.badge--neutro]="!franjaFila.creado_manualmente">
                    {{ franjaFila.creado_manualmente ? 'Manual' : 'Institucional' }}
                  </span>
                </td>
                <td>
                  <button
                    mat-icon-button
                    type="button"
                    color="warn"
                    [disabled]="!franjaFila.creado_manualmente"
                    (click)="abrirCancelacion(franjaFila)"
                    aria-label="Cancelar grupo"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        }
      </table>
    }

    <app-reserva-semestral-form-dialog [(visible)]="formDialogVisible" />
    <app-reserva-semestral-cancelacion-dialog
      [(visible)]="cancelacionDialogVisible"
      [franjas]="grupoACancelar()"
    />
  `,
  styles: `
    .reservas-semestrales-list__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4, 1rem);
      margin-bottom: var(--space-4, 1rem);
    }

    .reservas-semestrales-list__buscador {
      min-width: 20rem;
    }

    .tabla-simple {
      width: 100%;
      border-collapse: collapse;
    }

    .tabla-simple th {
      background: #f5f7f6;
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      color: #1a1a1a;
      text-align: left;
      padding: 0.5rem 0.75rem;
    }

    .tabla-simple td {
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 0.875rem;
      color: #1a1a1a;
      padding: 0.5rem 0.75rem;
    }

    .reservas-semestrales-list__grupo-header td {
      background: #f5f7f6;
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
    }

    .reservas-semestrales-list__vacio {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: var(--space-4, 1rem);
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

    .badge--neutro {
      background: #1d3475;
    }
  `,
})
export class ReservasSemestralesListComponent {
  protected readonly reservasSemestralesService = inject(ReservasSemestralesService);
  protected readonly lookups = inject(ReservasSemestralesLookupsService);

  protected readonly busqueda = signal('');
  protected readonly formDialogVisible = signal(false);
  protected readonly cancelacionDialogVisible = signal(false);
  protected readonly grupoACancelar = signal<ReservaSemestral[]>([]);

  protected readonly cargando = computed(() => this.reservasSemestralesService.reservas.isPending());

  /**
   * Se ordena por `grupo_id` antes de agrupar: garantiza que las franjas del
   * mismo grupo queden consecutivas sin depender de ningún orden de columna.
   */
  protected readonly filtradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const reservas = this.reservasSemestralesService.reservas.data() ?? [];

    const coincidentes = reservas.filter((reserva) => {
      if (!termino) {
        return true;
      }
      return [
        this.lookups.nombreSalon(reserva.salon_id),
        this.lookups.nombrePersona(reserva.solicitante_id),
        this.lookups.codigoSemestre(reserva.semestre_id),
        ETIQUETAS_DIA_SEMANA[reserva.dia],
      ].some((texto) => texto.toLowerCase().includes(termino));
    });

    return [...coincidentes].sort((a, b) => a.grupo_id.localeCompare(b.grupo_id));
  });

  /** Arma los bloques de la tabla: una entrada por `grupo_id`, con los campos
   * compartidos ya resueltos y la lista de franjas del grupo. */
  protected readonly grupos = computed<GrupoFilas[]>(() => {
    const porGrupo = new Map<string, ReservaSemestral[]>();
    for (const reserva of this.filtradas()) {
      const franjas = porGrupo.get(reserva.grupo_id) ?? [];
      franjas.push(reserva);
      porGrupo.set(reserva.grupo_id, franjas);
    }

    return [...porGrupo.entries()].map(([grupoId, franjas]) => {
      const primera = franjas[0];
      return {
        grupoId,
        salon: this.lookups.nombreSalon(primera.salon_id),
        solicitante: this.lookups.nombrePersona(primera.solicitante_id),
        semestre: this.lookups.codigoSemestre(primera.semestre_id),
        franjas,
      };
    });
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected etiquetaDia(dia: ReservaSemestral['dia']): string {
    return ETIQUETAS_DIA_SEMANA[dia];
  }

  protected franja(reserva: ReservaSemestral): string {
    return `${formatearHora(reserva.hora_inicio)} — ${formatearHora(reserva.hora_fin)}`;
  }

  protected abrirFormulario(): void {
    this.formDialogVisible.set(true);
  }

  /** Recolecta TODAS las franjas del grupo de `reserva`, no solo esa fila:
   * el diálogo de cancelación confirma y elimina el grupo completo. */
  protected abrirCancelacion(reserva: ReservaSemestral): void {
    const reservas = this.reservasSemestralesService.reservas.data() ?? [];
    this.grupoACancelar.set(reservas.filter((r) => r.grupo_id === reserva.grupo_id));
    this.cancelacionDialogVisible.set(true);
  }
}
