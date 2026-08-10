import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { PrestamoDetallesService } from './prestamo-detalles.service';
import { PrestamosLookupsService } from './prestamos-lookups.service';
import { ETIQUETAS_ESTADO_DETALLE_EQUIPO, type EstadoDetalleEquipo } from './prestamos.models';

/**
 * Severidad de `p-tag` por estado del equipo dentro del préstamo: un equipo
 * todavía en poder del solicitante es información neutra; uno ya devuelto es
 * el cierre exitoso de su parte del ciclo.
 */
const SEVERIDAD_ESTADO_EQUIPO: Record<EstadoDetalleEquipo, 'info' | 'success'> = {
  entregado: 'info',
  devuelto: 'success',
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
 */
@Component({
  selector: 'app-prestamo-detalles',
  standalone: true,
  imports: [DatePipe, TableModule, TagModule],
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
      <p-table [value]="detallesService.detalles.data() ?? []" dataKey="id" size="small">
        <ng-template #header>
          <tr>
            <th>Equipo</th>
            <th>Estado del equipo</th>
            <th>Entregado</th>
            <th>Devuelto</th>
            <th>Novedad</th>
          </tr>
        </ng-template>
        <ng-template #body let-detalle>
          <tr>
            <td>{{ lookups.nombreEquipo(detalle.equipo_id) }}</td>
            <td>
              <p-tag
                [severity]="severidadEstadoEquipo(detalle.estado_equipo)"
                [value]="etiquetaEstadoEquipo(detalle.estado_equipo)"
              />
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
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="5">Este préstamo no tiene equipos registrados.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <section class="prestamo-detalles__seccion">
      <h3>Devoluciones</h3>
      <p-table [value]="detallesService.devoluciones.data() ?? []" dataKey="id" size="small">
        <ng-template #header>
          <tr>
            <th>Fecha</th>
            <th>Recibido por</th>
            <th>Ubicación</th>
            <th>Tipo</th>
          </tr>
        </ng-template>
        <ng-template #body let-devolucion>
          <tr>
            <td>{{ devolucion.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
            <td>{{ lookups.nombreUsuario(devolucion.usuario_recibe_id) }}</td>
            <td>{{ lookups.nombreUbicacion(devolucion.ubicacion_id) }}</td>
            <td>{{ devolucion.es_completa ? 'Completa' : 'Parcial' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="4">Este préstamo todavía no tiene devoluciones.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>
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

  protected severidadEstadoEquipo(estado: EstadoDetalleEquipo): 'info' | 'success' {
    return SEVERIDAD_ESTADO_EQUIPO[estado];
  }
}
