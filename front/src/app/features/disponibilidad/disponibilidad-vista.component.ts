import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';

import { DisponibilidadLookupsService } from './disponibilidad-lookups.service';
import { DisponibilidadService } from './disponibilidad.service';
import {
  ETIQUETAS_ORIGEN,
  formatearHora,
  type ErrorDetalleDto,
  type Ocupacion,
  type Origen,
} from './disponibilidad.models';

/**
 * Clase de badge por origen de la ocupación — mismo criterio de
 * `CLASE_BADGE_ESTADO` en el resto de las listas del proyecto, pero
 * mapeando origen en vez de estado: cada una de las tres fuentes que
 * superpone RF14 necesita distinguirse a simple vista en la lista.
 */
const CLASE_BADGE_ORIGEN: Record<Origen, string> = {
  programacion: 'badge--info',
  reserva_semestral: 'badge--atencion',
  reserva_individual: 'badge--exito',
};

/**
 * Vista de RF14: disponibilidad de un salón en una fecha, superponiendo las
 * tres fuentes (programación académica, reservas semestrales, reservas
 * individuales) y resaltando los conflictos que el backend ya calculó. Es
 * 100% de solo lectura — no hay ninguna acción de escritura acá, a
 * diferencia de `reservas` o `llaves`.
 *
 * Nota de diseño — sin librería de calendario/scheduler (ninguna está
 * instalada en el proyecto, y esta feature no agrega dependencias nuevas):
 * la vista es una lista simple ordenada por `hora_inicio`, con un badge de
 * color distinto por `origen` y un badge de peligro adicional en cada
 * ocupación que aparece en `conflictos`. Una grilla de horario tipo
 * calendario sería más vistosa, pero el caso de uso central (RF14) es
 * detectar solapamientos, no visualizar huecos libres — una lista
 * cronológica con el conflicto resaltado responde esa pregunta con menos
 * código y sin depender de una librería no auditada para el proyecto.
 *
 * Nota de diseño — `fechaSeleccionada` es una señal LOCAL (`Date`, lo que
 * produce `mat-datepicker`) separada de `DisponibilidadService.fecha`
 * (`string | null`, lo que viaja por HTTP): mismo desacople que
 * `ReservaFormDialogComponent` hace con sus campos de fecha/hora, y por el
 * mismo motivo — `toISOString()` desplazaría el día en Colombia (UTC-5), así
 * que la conversión usa los componentes LOCALES del `Date` (`aFechaIso`
 * abajo, copia de la de `reserva-form-dialog.component.ts`).
 *
 * Nota de diseño — la fecha arranca en HOY (`new Date()` al construir el
 * componente): es el caso de uso principal descrito en la tarea de esta
 * feature (elegir salón + fecha concreta), así que no tiene sentido arrancar
 * sin fecha y obligar a un clic extra.
 *
 * Migrado de PrimeNG a Angular Material: `p-select` -> `mat-select` (14
 * salones es una lista corta, sin necesidad de autocomplete); `p-datepicker`
 * -> `mat-datepicker` con `provideNativeDateAdapter()` (el componente es
 * standalone, así que el adapter se declara acá en vez de en `app.config.ts`
 * para no acoplar el resto de la app a `MatNativeDateModule`); `p-tag` ->
 * badge propio (ver `CLASE_BADGE_ORIGEN`).
 */
@Component({
  selector: 'app-disponibilidad-vista',
  standalone: true,
  imports: [
    FormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    <header class="disponibilidad-vista__header">
      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Salón</mat-label>
        <mat-select
          [ngModel]="disponibilidadService.salonId()"
          (ngModelChange)="onSalonChange($event)"
          aria-label="Selecciona un salón"
        >
          <mat-option [value]="null">Selecciona un salón</mat-option>
          @for (opcion of lookups.opcionesSalones(); track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field subscriptSizing="dynamic" appearance="outline">
        <mat-label>Fecha</mat-label>
        <input
          matInput
          [matDatepicker]="selectorFecha"
          [ngModel]="fechaSeleccionada()"
          (ngModelChange)="onFechaChange($event)"
          aria-label="Selecciona una fecha"
        />
        <mat-datepicker-toggle matIconSuffix [for]="selectorFecha" />
        <mat-datepicker #selectorFecha />
      </mat-form-field>
    </header>

    @if (!disponibilidadService.salonId()) {
      <p class="disponibilidad-vista__vacio">
        <mat-icon class="disponibilidad-vista__vacio-icono">meeting_room</mat-icon>
        <br />
        Selecciona un salón para consultar su disponibilidad.
      </p>
    } @else if (disponibilidadService.disponibilidad.isError()) {
      <p role="alert">{{ mensajeError() }}</p>
    } @else if (disponibilidadService.disponibilidad.isPending()) {
      <p>Cargando disponibilidad...</p>
    } @else if (ocupacionesOrdenadas().length === 0) {
      <p class="disponibilidad-vista__vacio">
        <mat-icon class="disponibilidad-vista__vacio-icono">event_available</mat-icon>
        <br />
        No hay ocupaciones registradas para este salón en esta fecha.
      </p>
    } @else {
      <ul class="disponibilidad-vista__lista">
        @for (ocupacion of ocupacionesOrdenadas(); track ocupacion.id) {
          <li
            class="disponibilidad-vista__item"
            [class.disponibilidad-vista__item--conflicto]="tieneConflicto(ocupacion.id)"
            data-testid="ocupacion"
            [attr.data-conflicto]="tieneConflicto(ocupacion.id)"
          >
            <span class="disponibilidad-vista__franja">{{ franja(ocupacion) }}</span>
            <span class="badge" [class]="claseBadgeOrigen(ocupacion.origen)">
              {{ etiquetaOrigen(ocupacion.origen) }}
            </span>
            <span class="disponibilidad-vista__titulo">{{ ocupacion.titulo }}</span>
            @if (tieneConflicto(ocupacion.id)) {
              <span class="badge badge--peligro" aria-label="Conflicto de horario con otra ocupación">
                <mat-icon inline>warning</mat-icon>
                Conflicto
              </span>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .disponibilidad-vista__header {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .disponibilidad-vista__lista {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .disponibilidad-vista__item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
    }

    .disponibilidad-vista__titulo {
      flex: 1;
    }

    .disponibilidad-vista__vacio {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: var(--space-4);
    }

    .disponibilidad-vista__vacio-icono {
      color: #9ca3af;
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 4px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
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
export class DisponibilidadVistaComponent {
  protected readonly disponibilidadService = inject(DisponibilidadService);
  protected readonly lookups = inject(DisponibilidadLookupsService);

  protected readonly fechaSeleccionada = signal(new Date());

  constructor() {
    // Fecha por defecto: hoy. Se fija la señal del servicio en el mismo tick
    // de construcción, no en un `ngOnInit` aparte: no hay lógica adicional
    // que justifique esperar el ciclo de vida completo.
    this.disponibilidadService.fecha.set(aFechaIso(this.fechaSeleccionada()));
  }

  // Ids presentes en cualquiera de los dos lados de `conflictos` — se
  // consulta con `.has()` por cada fila en vez de recorrer el arreglo en
  // cada `tieneConflicto()`.
  private readonly idsEnConflicto = computed(() => {
    const conflictos = this.disponibilidadService.disponibilidad.data()?.conflictos ?? [];
    const ids = new Set<string>();
    for (const conflicto of conflictos) {
      ids.add(conflicto.ocupacion_a_id);
      ids.add(conflicto.ocupacion_b_id);
    }
    return ids;
  });

  protected readonly ocupacionesOrdenadas = computed(() => {
    const ocupaciones = this.disponibilidadService.disponibilidad.data()?.ocupaciones ?? [];
    // Copia antes de ordenar: `.sort()` muta, y `ocupaciones` puede ser el
    // mismo arreglo que TanStack tiene cacheado.
    return [...ocupaciones].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  });

  protected onSalonChange(salonId: string | null): void {
    this.disponibilidadService.salonId.set(salonId);
  }

  protected onFechaChange(fecha: Date | null): void {
    const fechaEfectiva = fecha ?? new Date();
    this.fechaSeleccionada.set(fechaEfectiva);
    this.disponibilidadService.fecha.set(aFechaIso(fechaEfectiva));
  }

  protected franja(ocupacion: Ocupacion): string {
    return `${formatearHora(ocupacion.hora_inicio)} — ${formatearHora(ocupacion.hora_fin)}`;
  }

  protected etiquetaOrigen(origen: Origen): string {
    return ETIQUETAS_ORIGEN[origen];
  }

  protected claseBadgeOrigen(origen: Origen): string {
    return CLASE_BADGE_ORIGEN[origen];
  }

  protected tieneConflicto(ocupacionId: string): boolean {
    return this.idsEnConflicto().has(ocupacionId);
  }

  // Copia local de `extraerMensajeError` (`features/reservas`): ninguna
  // feature importa código de otra (ver front/README.md). El backend de
  // disponibilidad devuelve el mismo `{detail: string}` en su único 400
  // (salón inexistente, o `dia`+`fecha` inconsistentes).
  protected mensajeError(): string {
    const error = this.disponibilidadService.disponibilidad.error();
    if (error instanceof HttpErrorResponse) {
      const cuerpo = error.error as ErrorDetalleDto | null | undefined;
      if (cuerpo && typeof cuerpo.detail === 'string' && cuerpo.detail.length > 0) {
        return cuerpo.detail;
      }
    }
    return 'No se pudo cargar la disponibilidad de este salón. Intenta de nuevo.';
  }
}

/** `Date` -> `YYYY-MM-DD` tomando los componentes LOCALES (copia de
 * `reserva-form-dialog.component.ts`: `toISOString()` desplazaría el día en
 * Colombia, UTC-5). */
function aFechaIso(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}
