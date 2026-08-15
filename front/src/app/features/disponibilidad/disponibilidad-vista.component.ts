import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';

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
 * Severidad de `p-tag` por origen de la ocupación — mismo criterio de
 * `SEVERIDAD_ESTADO` en `reservas-list.component.ts`, pero mapeando origen en
 * vez de estado: cada una de las tres fuentes que superpone RF14 necesita
 * distinguirse a simple vista en la lista.
 */
const SEVERIDAD_ORIGEN: Record<Origen, 'info' | 'success' | 'warn'> = {
  programacion: 'info',
  reserva_semestral: 'warn',
  reserva_individual: 'success',
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
 * la vista es una lista simple ordenada por `hora_inicio`, con un `p-tag` de
 * severidad distinta por `origen` (mismo patrón que `severidadEstado` de
 * `reservas-list.component.ts`) y un `p-tag severity="danger"` adicional en
 * cada ocupación que aparece en `conflictos`. Una grilla de horario tipo
 * calendario sería más vistosa, pero el caso de uso central (RF14) es
 * detectar solapamientos, no visualizar huecos libres — una lista
 * cronológica con el conflicto resaltado responde esa pregunta con menos
 * código y sin depender de una librería no auditada para el proyecto.
 *
 * Nota de diseño — `fechaSeleccionada` es una señal LOCAL (`Date`, lo que
 * produce `p-datepicker`) separada de `DisponibilidadService.fecha`
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
 */
@Component({
  selector: 'app-disponibilidad-vista',
  standalone: true,
  imports: [FormsModule, SelectModule, DatePickerModule, TagModule],
  template: `
    <header class="disponibilidad-vista__header">
      <p-select
        [options]="lookups.opcionesSalones()"
        optionLabel="label"
        optionValue="value"
        [ngModel]="disponibilidadService.salonId()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onSalonChange($event)"
        [filter]="true"
        filterBy="label"
        [showClear]="true"
        ariaLabel="Selecciona un salón"
        placeholder="Selecciona un salón"
      />
      <p-datepicker
        [ngModel]="fechaSeleccionada()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onFechaChange($event)"
        dateFormat="dd/mm/yy"
        [showIcon]="true"
        ariaLabel="Selecciona una fecha"
      />
    </header>

    @if (!disponibilidadService.salonId()) {
      <p>Selecciona un salón para consultar su disponibilidad.</p>
    } @else if (disponibilidadService.disponibilidad.isError()) {
      <p role="alert">{{ mensajeError() }}</p>
    } @else if (disponibilidadService.disponibilidad.isPending()) {
      <p>Cargando disponibilidad...</p>
    } @else if (ocupacionesOrdenadas().length === 0) {
      <p>No hay ocupaciones registradas para este salón en esta fecha.</p>
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
            <p-tag
              [severity]="severidadOrigen(ocupacion.origen)"
              [value]="etiquetaOrigen(ocupacion.origen)"
            />
            <span class="disponibilidad-vista__titulo">{{ ocupacion.titulo }}</span>
            @if (tieneConflicto(ocupacion.id)) {
              <p-tag
                severity="danger"
                value="Conflicto"
                icon="pi pi-exclamation-triangle"
                [ariaLabel]="'Conflicto de horario con otra ocupación'"
              />
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

  protected severidadOrigen(origen: Origen): 'info' | 'success' | 'warn' {
    return SEVERIDAD_ORIGEN[origen];
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
