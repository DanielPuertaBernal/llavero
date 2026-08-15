import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';

import { PrestamoDetallesService } from './prestamo-detalles.service';
import { PrestamosLookupsService } from './prestamos-lookups.service';
import { ETIQUETAS_ESTADO_DETALLE_EQUIPO, type EstadoDetalleEquipo } from './prestamos.models';

/**
 * Clase de badge por estado del equipo dentro del préstamo: un equipo
 * todavía en poder del solicitante es información neutra; uno ya devuelto es
 * el cierre exitoso de su parte del ciclo.
 */
const CLASE_BADGE_ESTADO_EQUIPO: Record<EstadoDetalleEquipo, string> = {
  entregado: 'badge--info',
  devuelto: 'badge--exito',
};

/**
 * Contenido de la fila expandida de la tabla de préstamos: los equipos de
 * ESE préstamo (`GET /api/prestamos/{id}/detalles`) y sus devoluciones
 * (`GET /api/prestamos/{id}/devoluciones`).
 *
 * Nota de arquitectura — el componente provee su propia instancia de
 * `PrestamoDetallesService` (`providers: [...]`, ver el docblock de ese
 * servicio): varias filas pueden estar expandidas a la vez y cada una habla
 * de un préstamo distinto, así que un singleton de raíz con una sola señal
 * `prestamoId` no serviría. El `input` requerido se copia a esa señal con un
 * `effect`, que es lo que habilita las dos consultas.
 *
 * Los ids de equipo, usuario, ubicación y novedad se resuelven contra
 * `PrestamosLookupsService` (ese sí de raíz: son catálogos globales), con el
 * id crudo como respaldo mientras el lookup carga.
 *
 * Migrado de PrimeNG a Angular Material: tablas HTML simples (sin
 * sorting/paginación real) y badges propios en vez de `p-tag`.
 */
@Component({
  selector: 'app-prestamo-detalles',
  standalone: true,
  imports: [DatePipe],
  providers: [PrestamoDetallesService],
  template: `
    @if (cargando()) {
      <p class="prestamo-detalles__estado">Cargando el detalle del préstamo...</p>
    }

    @if (conError()) {
      <p role="alert">No se pudo cargar el detalle del préstamo. Intenta de nuevo.</p>
    }

    <section class="prestamo-detalles__seccion">
      <h3>Equipos del préstamo</h3>
      <table class="tabla-simple tabla-simple--chica">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>Estado del equipo</th>
            <th>Entregado</th>
            <th>Devuelto</th>
            <th>Novedad</th>
          </tr>
        </thead>
        <tbody>
          @if ((detallesService.detalles.data() ?? []).length === 0) {
            <tr>
              <td colspan="5" class="tabla-simple__estado-vacio">
                Este préstamo no tiene equipos registrados.
              </td>
            </tr>
          } @else {
            @for (detalle of detallesService.detalles.data() ?? []; track detalle.id) {
              <tr>
                <td>{{ lookups.nombreEquipo(detalle.equipo_id) }}</td>
                <td>
                  <span class="badge" [class]="claseBadgeEstadoEquipo(detalle.estado_equipo)">
                    {{ etiquetaEstadoEquipo(detalle.estado_equipo) }}
                  </span>
                </td>
                <td>{{ detalle.fecha_entrega | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td>
                  {{
                    detalle.fecha_devolucion
                      ? (detalle.fecha_devolucion | date: 'dd/MM/yyyy HH:mm')
                      : '—'
                  }}
                </td>
                <td>{{ detalle.novedad_id ? lookups.nombreNovedad(detalle.novedad_id) : '—' }}</td>
              </tr>
            }
          }
        </tbody>
      </table>
    </section>

    <section class="prestamo-detalles__seccion">
      <h3>Devoluciones</h3>
      <table class="tabla-simple tabla-simple--chica">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Recibido por</th>
            <th>Ubicación</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          @if ((detallesService.devoluciones.data() ?? []).length === 0) {
            <tr>
              <td colspan="4" class="tabla-simple__estado-vacio">
                Este préstamo todavía no tiene devoluciones.
              </td>
            </tr>
          } @else {
            @for (devolucion of detallesService.devoluciones.data() ?? []; track devolucion.id) {
              <tr>
                <td>{{ devolucion.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td>{{ lookups.nombreUsuario(devolucion.usuario_recibe_id) }}</td>
                <td>{{ lookups.nombreUbicacion(devolucion.ubicacion_id) }}</td>
                <td>{{ devolucion.es_completa ? 'Completa' : 'Parcial' }}</td>
              </tr>
            }
          }
        </tbody>
      </table>
    </section>
  `,
  styles: `
    .prestamo-detalles__estado {
      margin: 0 0 var(--space-2);
    }

    .prestamo-detalles__seccion {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-6);
    }

    .prestamo-detalles__seccion:last-child {
      margin-bottom: 0;
    }

    .tabla-simple {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }

    .tabla-simple--chica th,
    .tabla-simple--chica td {
      padding: 6px 10px;
      font-size: 12px;
    }

    .tabla-simple th {
      background: #f5f7f6;
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-weight: 700;
      color: #1a1a1a;
      text-align: left;
    }

    .tabla-simple td {
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      color: #1a1a1a;
    }

    .tabla-simple__estado-vacio {
      text-align: center;
      font-family: Montserrat, sans-serif;
      font-style: italic;
      color: #6b7280;
      padding: 16px;
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
  `,
})
export class PrestamoDetallesComponent {
  /** Requerido: sin préstamo esta vista no tiene nada que mostrar. */
  readonly prestamoId = input.required<string>();

  protected readonly detallesService = inject(PrestamoDetallesService);
  protected readonly lookups = inject(PrestamosLookupsService);

  protected readonly cargando = computed(
    () =>
      this.detallesService.detalles.isFetching() || this.detallesService.devoluciones.isFetching(),
  );

  protected readonly conError = computed(
    () => this.detallesService.detalles.isError() || this.detallesService.devoluciones.isError(),
  );

  constructor() {
    // Único puente entre el `input` del componente y la señal del servicio:
    // escribirlo es lo que habilita las dos consultas (hasta entonces están
    // deshabilitadas, ver `PrestamoDetallesService`).
    effect(() => {
      this.detallesService.prestamoId.set(this.prestamoId());
    });
  }

  protected etiquetaEstadoEquipo(estado: EstadoDetalleEquipo): string {
    return ETIQUETAS_ESTADO_DETALLE_EQUIPO[estado];
  }

  protected claseBadgeEstadoEquipo(estado: EstadoDetalleEquipo): string {
    return CLASE_BADGE_ESTADO_EQUIPO[estado];
  }
}
