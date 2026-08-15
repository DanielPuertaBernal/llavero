import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { DashboardLookupsService } from './dashboard-lookups.service';
import { DashboardService } from './dashboard.service';
import type { TipoEvento, TipoRecurso } from './dashboard.models';

// `extraerMensajeError` (dashboard-error.util.ts) no se usa en este
// componente: ninguna de las cinco queries de KPI expone su `error` crudo a
// la plantilla (solo `isError()`), así que no hay ningún `HttpErrorResponse`
// que formatear aquí -- el mensaje de cada tarjeta fallida es un texto fijo
// (`mensajeErrorKpi` abajo). El util igual se declara en su propio archivo,
// mismo criterio que el resto de features, por si una futura tarjeta
// necesita mostrar el detalle exacto del backend.

interface TarjetaKpi {
  titulo: string;
  valor: number | null;
  cargando: boolean;
  error: boolean;
  routerLink: string;
}

/**
 * Panel de resumen (Dashboard) -- decimocuarta y última feature del
 * frontend, reemplaza a `DashboardPlaceholderComponent` en la ruta
 * `/dashboard` (ver `app.routes.ts`).
 *
 * Nota de alcance -- SOLO LECTURA (mismo criterio que
 * `disponibilidad`/`comunidad`/`historial`): ninguna tarjeta tiene acción de
 * escritura, todas enlazan (`routerLink`) a la vista completa de su feature
 * dueña, donde sí viven las acciones. Ver la nota de alcance completa en
 * `dashboard.models.ts` para por qué no existe un `back/dashboard/` propio:
 * este panel combina, client-side, seis `GET /` ya expuestos por sus
 * features dueñas.
 *
 * Nota de diseño -- cada tarjeta distingue tres estados (cargando / error /
 * valor), nunca colapsa un error a "0": un conteo en cero y una consulta
 * fallida no deben leerse igual (mismo espíritu que `historial`/
 * `disponibilidad`, que muestran `role="alert"` en vez de una lista vacía
 * silenciosa cuando la carga falla).
 *
 * Nota de diseño -- el aviso de Portero (RF28) se repite aquí con el mismo
 * texto que `HistorialListComponent` a propósito: es la misma restricción
 * (`DashboardService.esPortero()`, ver su nota de diseño) aplicada a una
 * vista distinta -- quien la lee debe reconocer de inmediato que está viendo
 * un subconjunto, sin tener que abrir `/historial` para enterarse.
 */
@Component({
  selector: 'app-dashboard-resumen',
  standalone: true,
  imports: [CommonModule, RouterLink, CardModule, TableModule, TagModule],
  template: `
    <h1>Panel de resumen</h1>

    <section class="dashboard-resumen__kpis">
      @for (tarjeta of tarjetas(); track tarjeta.titulo) {
        <p-card [header]="tarjeta.titulo" [routerLink]="tarjeta.routerLink" class="dashboard-resumen__kpi">
          @if (tarjeta.error) {
            <p role="alert">{{ mensajeErrorKpi }}</p>
          } @else if (tarjeta.cargando) {
            <p>Cargando…</p>
          } @else {
            <p class="dashboard-resumen__kpi-valor">{{ tarjeta.valor }}</p>
          }
        </p-card>
      }
    </section>

    <section class="dashboard-resumen__actividad">
      <header class="dashboard-resumen__actividad-header">
        <h2>Actividad reciente</h2>
        <a routerLink="/historial">Ver historial completo</a>
      </header>

      @if (dashboardService.esPortero()) {
        <p-tag severity="info" value="Mostrando solo tus registros" />
      }

      @if (dashboardService.actividadReciente.isError()) {
        <p role="alert">No se pudo cargar la actividad reciente. Intenta de nuevo.</p>
      }

      <p-table [value]="dashboardService.ultimosEventos()" [loading]="cargandoActividad()">
        <ng-template #header>
          <tr>
            <th>Fecha y hora</th>
            <th>Tipo de recurso</th>
            <th>Tipo de evento</th>
            <th>Procesado por</th>
          </tr>
        </ng-template>
        <ng-template #body let-evento>
          <tr>
            <td>{{ evento.fecha_hora | date: 'dd/MM/yyyy HH:mm' }}</td>
            <td>
              <p-tag
                [severity]="severidadRecurso(evento.tipo_recurso)"
                [value]="etiquetaRecurso(evento.tipo_recurso)"
              />
            </td>
            <td>
              <p-tag
                [severity]="severidadEvento(evento.tipo_evento)"
                [value]="etiquetaEvento(evento.tipo_evento)"
              />
            </td>
            <td>{{ lookups.nombreUsuario(evento.procesado_por_id) }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="4">No hay actividad reciente para mostrar.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>
  `,
})
export class DashboardResumenComponent {
  protected readonly dashboardService = inject(DashboardService);
  protected readonly lookups = inject(DashboardLookupsService);

  protected readonly mensajeErrorKpi = 'No se pudo cargar. Intenta de nuevo.';

  protected readonly cargandoActividad = computed(
    () => this.dashboardService.actividadReciente.isPending(),
  );

  protected readonly tarjetas = computed<TarjetaKpi[]>(() => [
    {
      titulo: 'Llaves fuera',
      valor: this.dashboardService.llavesFuera(),
      cargando: this.dashboardService.llaves.isPending(),
      error: this.dashboardService.llaves.isError(),
      routerLink: '/llaves',
    },
    {
      titulo: 'Préstamos activos',
      valor: this.dashboardService.prestamosActivos(),
      cargando: this.dashboardService.prestamos.isPending(),
      error: this.dashboardService.prestamos.isError(),
      routerLink: '/prestamos',
    },
    {
      titulo: 'Novedades abiertas',
      valor: this.dashboardService.novedadesAbiertas(),
      cargando: this.dashboardService.novedades.isPending(),
      error: this.dashboardService.novedades.isError(),
      routerLink: '/novedades',
    },
    {
      titulo: 'Notificaciones fallidas',
      valor: this.dashboardService.notificacionesFallidas(),
      cargando: this.dashboardService.notificaciones.isPending(),
      error: this.dashboardService.notificaciones.isError(),
      routerLink: '/notificaciones',
    },
    {
      titulo: 'Reservas de hoy',
      valor: this.dashboardService.reservasDeHoy(),
      cargando: this.dashboardService.reservas.isPending(),
      error: this.dashboardService.reservas.isError(),
      routerLink: '/reservas',
    },
  ]);

  protected severidadRecurso(tipoRecurso: TipoRecurso): 'info' | 'warn' {
    return tipoRecurso === 'llave' ? 'info' : 'warn';
  }

  protected etiquetaRecurso(tipoRecurso: TipoRecurso): string {
    return tipoRecurso === 'llave' ? 'Llave' : 'Equipo';
  }

  protected severidadEvento(tipoEvento: TipoEvento): 'success' | 'info' {
    return tipoEvento === 'entrega' ? 'success' : 'info';
  }

  protected etiquetaEvento(tipoEvento: TipoEvento): string {
    return tipoEvento === 'entrega' ? 'Entrega' : 'Devolución';
  }
}
