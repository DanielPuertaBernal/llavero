import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

import { ReservaSemestralCancelacionDialogComponent } from './reserva-semestral-cancelacion-dialog.component';
import { ReservaSemestralFormDialogComponent } from './reserva-semestral-form-dialog.component';
import { ReservasSemestralesLookupsService } from './reservas-semestrales-lookups.service';
import { ReservasSemestralesService } from './reservas-semestrales.service';
import { ETIQUETAS_DIA_SEMANA, formatearHora, type ReservaSemestral } from './reservas-semestrales.models';

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
 * `grupo_id` se repiten. Por eso se usa el `rowGroupMode="subheader"` nativo
 * de `p-table`: la sub-cabecera muestra una sola vez los campos compartidos
 * del grupo (salón, solicitante, semestre) y cada fila del cuerpo muestra
 * solo lo que varía (día, franja horaria, origen). Repetir esas tres
 * columnas en cada fila —como una tabla plana— sería ruido visual para un
 * grupo que puede tener hasta 7 franjas.
 *
 * Nota de diseño — el botón "Cancelar grupo" vive en cada fila del CUERPO
 * (no en la sub-cabecera): visualmente pertenece a la franja donde el
 * operador puso el cursor, pero dispara la cancelación del GRUPO completo
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
 * Nota de diseño — sin columna "Estado" ni `p-tag` de severidad por estado, a
 * diferencia de `reservas`: `ReservaSemestral` no tiene esa columna (ver
 * reservas-semestrales.models.ts). El único `p-tag` acá distingue origen
 * (manual/institucional), no ciclo de vida.
 */
@Component({
  selector: 'app-reservas-semestrales-list',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    TagModule,
    ToastModule,
    ReservaSemestralFormDialogComponent,
    ReservaSemestralCancelacionDialogComponent,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <header class="reservas-semestrales-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar por salón, solicitante, semestre o día..."
        aria-label="Buscar reserva semestral por salón, solicitante, semestre o día"
        (input)="onBusquedaChange($event)"
      />
      <p-button label="Registrar reserva semestral" icon="pi pi-plus" (onClick)="abrirFormulario()" />
    </header>

    @if (reservasSemestralesService.reservas.isError()) {
      <p role="alert">No se pudieron cargar las reservas semestrales. Intenta de nuevo.</p>
    }

    <p-table
      [value]="filtradas()"
      [loading]="cargando()"
      dataKey="id"
      rowGroupMode="subheader"
      groupRowsBy="grupo_id"
      sortField="grupo_id"
      [sortOrder]="1"
    >
      <ng-template #groupheader let-reserva>
        <tr>
          <td colspan="4" class="reservas-semestrales-list__grupo-header">
            <strong>{{ lookups.nombreSalon(reserva.salon_id) }}</strong>
            — {{ lookups.nombrePersona(reserva.solicitante_id) }}
            — {{ lookups.codigoSemestre(reserva.semestre_id) }}
          </td>
        </tr>
      </ng-template>
      <ng-template #header>
        <tr>
          <th>Día</th>
          <th>Franja</th>
          <th>Origen</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-reserva>
        <tr>
          <td>{{ etiquetaDia(reserva.dia) }}</td>
          <td>{{ franja(reserva) }}</td>
          <td>
            <p-tag
              [severity]="reserva.creado_manualmente ? 'info' : 'secondary'"
              [value]="reserva.creado_manualmente ? 'Manual' : 'Institucional'"
            />
          </td>
          <td>
            <p-button
              icon="pi pi-times"
              [text]="true"
              severity="danger"
              [disabled]="!reserva.creado_manualmente"
              (onClick)="abrirCancelacion(reserva)"
              ariaLabel="Cancelar grupo"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="4">No hay reservas semestrales registradas para este filtro.</td>
        </tr>
      </ng-template>
    </p-table>

    <app-reserva-semestral-form-dialog [(visible)]="formDialogVisible" />
    <app-reserva-semestral-cancelacion-dialog
      [(visible)]="cancelacionDialogVisible"
      [franjas]="grupoACancelar()"
    />
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
   * Se ordena por `grupo_id` antes de pasarla a `p-table`: `rowGroupMode=
   * "subheader"` de PrimeNG necesita las filas del mismo grupo CONSECUTIVAS
   * para no repetir la sub-cabecera — presortear acá garantiza eso sin
   * depender de que el usuario interactúe con un `p-columnFilter`/orden de
   * columna que esta tabla no tiene.
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
