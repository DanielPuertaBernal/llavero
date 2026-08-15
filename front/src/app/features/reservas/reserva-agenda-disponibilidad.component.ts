import { Component, computed, input, output } from '@angular/core';

import { ETIQUETAS_ORIGEN_OCUPACION, formatearHora, type OcupacionAgenda } from './reserva-disponibilidad.models';

/** Slot de media hora en minutos desde medianoche, ventana operativa
 * 06:00–22:00 (no hay contrato de "horario de operación del campus" en el
 * backend — ventana razonable elegida para no listar 24h de slots vacíos de
 * madrugada). */
const INICIO_VENTANA_MIN = 6 * 60;
const FIN_VENTANA_MIN = 22 * 60;
const PASO_MIN = 60;

export type EstadoSlot = 'disponible' | 'seleccionado' | 'programacion' | 'reserva_semestral' | 'reserva_individual';

export interface SlotAgenda {
  inicioMin: number;
  finMin: number;
  estado: EstadoSlot;
  etiqueta: string;
}

/**
 * Panel "Agenda de disponibilidad" del diálogo de registro de reserva
 * individual — estructura calcada del screenshot real de AulaSync (columna
 * derecha del formulario de reserva), coloreada con la paleta de estado real
 * de UCO (ver `00-especificacion-visual.md`).
 *
 * Genera una grilla de slots de una hora en la ventana 06:00–22:00 y la
 * colorea contra las `ocupaciones` que le pasa el diálogo (ya filtradas por
 * salón+fecha vía `ReservaDisponibilidadService`, ver ese archivo). Un slot
 * sin ninguna ocupación superpuesta es "disponible"; si el rango
 * hora_inicio/hora_fin actual del formulario cubre el slot, se pinta
 * "seleccionado" en vez de "disponible" (prioridad visual de la elección
 * actual del operador sobre el estado de fondo).
 *
 * Clic en un slot libre: emite `slotElegido` con el rango horario del slot
 * para que el diálogo prellene `hora_inicio`/`hora_fin` — ver el comentario
 * en `reservaFormDialogComponent` sobre qué falta para que esto sea 100%
 * fiel al screenshot (la franja fija de 1h puede no calzar con el
 * `interval="15m"` real de los timepicker).
 */
@Component({
  selector: 'app-reserva-agenda-disponibilidad',
  standalone: true,
  template: `
    <div class="agenda">
      <h3 class="agenda__titulo">Agenda de disponibilidad</h3>
      @if (!salonSeleccionado()) {
        <p class="agenda__vacio">Selecciona salón y fecha para ver la agenda.</p>
      } @else if (cargando()) {
        <p class="agenda__vacio">Cargando agenda…</p>
      } @else {
        <p class="agenda__ayuda">Clic en un slot libre para pre-rellenar el horario.</p>
        <ul class="agenda__lista">
          @for (slot of slots(); track slot.inicioMin) {
            <li
              class="agenda__slot"
              [class.agenda__slot--clickable]="slot.estado === 'disponible'"
              (click)="onSlotClick(slot)"
            >
              <span class="agenda__dot" [class]="'agenda__dot--' + slot.estado"></span>
              <span class="agenda__rango">{{ formatearRango(slot) }}</span>
              <span class="agenda__estado-texto">{{ slot.etiqueta }}</span>
            </li>
          }
        </ul>
        <div class="agenda__leyenda">
          <span class="agenda__leyenda-item"
            ><span class="agenda__dot agenda__dot--disponible"></span> Disponible</span
          >
          <span class="agenda__leyenda-item"
            ><span class="agenda__dot agenda__dot--seleccionado"></span> Seleccionado</span
          >
          <span class="agenda__leyenda-item"
            ><span class="agenda__dot agenda__dot--programacion"></span> Clase</span
          >
          <span class="agenda__leyenda-item"
            ><span class="agenda__dot agenda__dot--reserva_semestral"></span> Semestral</span
          >
          <span class="agenda__leyenda-item"
            ><span class="agenda__dot agenda__dot--reserva_individual"></span> Reserva</span
          >
        </div>
      }
    </div>
  `,
  styles: `
    .agenda {
      background: #f5f7f6;
      border: var(--border-surface, 1px solid #e2e5e4);
      border-radius: var(--radius-lg);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      box-sizing: border-box;
    }

    .agenda__titulo {
      margin: 0;
      font-family: Montserrat, sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: #1a1a1a;
    }

    .agenda__ayuda {
      margin: 0 0 4px;
      font-family: Montserrat, sans-serif;
      font-size: var(--font-size-xs);
      color: #6b7280;
      font-style: italic;
    }

    .agenda__vacio {
      margin: 0;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      color: #6b7280;
      text-align: center;
      padding: 24px 0;
    }

    .agenda__lista {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 360px;
      overflow-y: auto;
    }

    .agenda__slot {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      transition: background-color var(--transition-fast);
    }

    .agenda__slot--clickable {
      cursor: pointer;
    }

    .agenda__slot--clickable:hover {
      background: #ffffff;
    }

    .agenda__dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .agenda__dot--disponible {
      background: #008b50;
    }

    .agenda__dot--seleccionado {
      background: #04b5ac;
    }

    .agenda__dot--programacion {
      background: #ffca00;
    }

    .agenda__dot--reserva_semestral {
      background: #e28210;
    }

    .agenda__dot--reserva_individual {
      background: #1d3475;
    }

    .agenda__rango {
      font-family: Montserrat, sans-serif;
      font-size: 12px;
      color: #1a1a1a;
      flex: 0 0 auto;
      width: 92px;
    }

    .agenda__estado-texto {
      font-family: Montserrat, sans-serif;
      font-size: 12px;
      color: #6b7280;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .agenda__leyenda {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      padding-top: 8px;
      border-top: 1px solid #e2e5e4;
    }

    .agenda__leyenda-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: Montserrat, sans-serif;
      font-size: var(--font-size-2xs);
      color: #6b7280;
    }
  `,
})
export class ReservaAgendaDisponibilidadComponent {
  readonly salonSeleccionado = input.required<boolean>();
  readonly cargando = input(false);
  readonly ocupaciones = input<OcupacionAgenda[]>([]);
  /** Rango horario elegido en el formulario, en minutos desde medianoche. */
  readonly rangoSeleccionadoMin = input<{ inicio: number; fin: number } | null>(null);

  readonly slotElegido = output<{ inicioMin: number; finMin: number }>();

  protected readonly slots = computed<SlotAgenda[]>(() => {
    const ocupaciones = this.ocupaciones();
    const seleccion = this.rangoSeleccionadoMin();
    const resultado: SlotAgenda[] = [];

    for (let inicio = INICIO_VENTANA_MIN; inicio < FIN_VENTANA_MIN; inicio += PASO_MIN) {
      const fin = inicio + PASO_MIN;
      const ocupacion = ocupaciones.find((o) => seSuperponen(inicio, fin, o));

      if (ocupacion) {
        resultado.push({
          inicioMin: inicio,
          finMin: fin,
          estado: ocupacion.origen,
          etiqueta: `${ocupacion.titulo} · ${ETIQUETAS_ORIGEN_OCUPACION[ocupacion.origen]}`,
        });
        continue;
      }

      const seleccionado = seleccion && inicio < seleccion.fin && fin > seleccion.inicio;
      resultado.push({
        inicioMin: inicio,
        finMin: fin,
        estado: seleccionado ? 'seleccionado' : 'disponible',
        etiqueta: seleccionado ? 'Seleccionado' : 'Disponible',
      });
    }

    return resultado;
  });

  protected onSlotClick(slot: SlotAgenda): void {
    if (slot.estado !== 'disponible') {
      return;
    }
    this.slotElegido.emit({ inicioMin: slot.inicioMin, finMin: slot.finMin });
  }

  protected formatearRango(slot: SlotAgenda): string {
    return `${aHoraLegible(slot.inicioMin)} — ${aHoraLegible(slot.finMin)}`;
  }
}

function seSuperponen(inicioMin: number, finMin: number, ocupacion: OcupacionAgenda): boolean {
  const inicioOcupacion = aMinutos(ocupacion.hora_inicio);
  const finOcupacion = aMinutos(ocupacion.hora_fin);
  return inicioMin < finOcupacion && finMin > inicioOcupacion;
}

function aMinutos(hora: string): number {
  const legible = formatearHora(hora);
  const [horas, minutos] = legible.split(':').map(Number);
  return horas * 60 + minutos;
}

function aHoraLegible(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const restoMinutos = minutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(restoMinutos).padStart(2, '0')}`;
}
