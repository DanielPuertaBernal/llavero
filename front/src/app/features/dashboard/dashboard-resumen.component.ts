import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';

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
 *
 * Migración PrimeNG → Angular Material: `p-card` se reemplaza por
 * `mat-card`, siguiendo LITERAL el estilo "Tarjeta KPI" / "Tarjeta KPI —
 * valor numérico grande" de la especificación visual UCO (fondo
 * `#f5f7f6`, borde `#e2e5e4`, radio 10px, valor grande en verde
 * institucional `#008b50`) para que las 5 tarjetas se lean de un vistazo,
 * sin gráficos: es lo primero que ve el usuario a diario. `p-table` se
 * reemplaza por una tabla-simple HTML simple (esta vista no ordena ni pagina) y
 * `p-tag` por un badge de estado propio con los colores semánticos del
 * spec.
 */
@Component({
  selector: 'app-dashboard-resumen',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule],
  template: `
    <h1>Panel de resumen</h1>

    <section class="dashboard-resumen__kpis">
      @for (tarjeta of tarjetas(); track tarjeta.titulo) {
        <a [routerLink]="tarjeta.routerLink" class="dashboard-resumen__kpi">
          <mat-card appearance="outlined" class="dashboard-resumen__kpi-card">
            <mat-card-header>
              <mat-card-title class="dashboard-resumen__kpi-titulo">{{ tarjeta.titulo }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (tarjeta.error) {
                <p role="alert" class="dashboard-resumen__kpi-error">{{ mensajeErrorKpi }}</p>
              } @else if (tarjeta.cargando) {
                <p class="dashboard-resumen__kpi-cargando">Cargando…</p>
              } @else {
                <p class="dashboard-resumen__kpi-valor">{{ tarjeta.valor }}</p>
              }
            </mat-card-content>
          </mat-card>
        </a>
      }
    </section>

    <section class="dashboard-resumen__actividad">
      <header class="dashboard-resumen__actividad-header">
        <h2>Actividad reciente</h2>
        <a routerLink="/historial">Ver historial completo</a>
      </header>

      @if (dashboardService.esPortero()) {
        <span class="badge badge--info">Mostrando solo tus registros</span>
      }

      @if (dashboardService.actividadReciente.isError()) {
        <p role="alert">No se pudo cargar la actividad reciente. Intenta de nuevo.</p>
      } @else if (cargandoActividad()) {
        <p>Cargando actividad reciente…</p>
      } @else {
        <table class="tabla-simple">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Tipo de recurso</th>
              <th>Tipo de evento</th>
              <th>Procesado por</th>
            </tr>
          </thead>
          <tbody>
            @for (evento of dashboardService.ultimosEventos(); track $index) {
              <tr>
                <td>{{ evento.fecha_hora | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td>
                  <span [class]="claseBadgeRecurso(evento.tipo_recurso)">
                    {{ etiquetaRecurso(evento.tipo_recurso) }}
                  </span>
                </td>
                <td>
                  <span [class]="claseBadgeEvento(evento.tipo_evento)">
                    {{ etiquetaEvento(evento.tipo_evento) }}
                  </span>
                </td>
                <td>{{ lookups.nombreUsuario(evento.procesado_por_id) }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="tabla-simple-simple__estado-vacio">No hay actividad reciente para mostrar.</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: `
    .dashboard-resumen__kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--space-4);
      margin: var(--space-4) 0;
    }

    .dashboard-resumen__kpi {
      text-decoration: none;
      color: inherit;
      display: block;
    }

    .dashboard-resumen__kpi-card {
      background: #f5f7f6 !important;
      border: 1px solid #e2e5e4 !important;
      border-radius: 10px !important;
      transition: box-shadow 0.15s ease;
    }

    .dashboard-resumen__kpi:hover .dashboard-resumen__kpi-card,
    .dashboard-resumen__kpi:focus-visible .dashboard-resumen__kpi-card {
      box-shadow: 0 4px 12px rgba(26, 26, 26, 0.12);
    }

    .dashboard-resumen__kpi-titulo {
      font-family: Montserrat, sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
    }

    .dashboard-resumen__kpi-valor {
      font-family: Montserrat, sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: #008b50;
      margin: 0;
    }

    .dashboard-resumen__kpi-cargando {
      color: #6b7280;
      margin: 0;
    }

    .dashboard-resumen__kpi-error {
      color: #e28210;
      margin: 0;
    }

    .dashboard-resumen__actividad-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-4);
    }

    .tabla-simple {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }

    .tabla-simple th {
      background: #f5f7f6;
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 12px;
      font-weight: 700;
      color: #1a1a1a;
      text-align: left;
      padding: var(--space-2) var(--space-3);
    }

    .tabla-simple td {
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      text-align: left;
      padding: var(--space-2) var(--space-3);
    }

    .tabla-simple-simple__estado-vacio {
      text-align: center;
      font-family: Montserrat, sans-serif;
      font-style: italic;
      color: #6b7280;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 10px;
      font-family: Poppins, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
    }

    .badge--info {
      background: #04b5ac;
    }

    .badge--exito {
      background: #008b50;
    }

    .badge--atencion {
      background: #ffca00;
      color: #1a1a1a;
    }
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

  protected claseBadgeRecurso(tipoRecurso: TipoRecurso): string {
    return tipoRecurso === 'llave' ? 'badge badge--info' : 'badge badge--atencion';
  }

  protected etiquetaRecurso(tipoRecurso: TipoRecurso): string {
    return tipoRecurso === 'llave' ? 'Llave' : 'Equipo';
  }

  protected claseBadgeEvento(tipoEvento: TipoEvento): string {
    return tipoEvento === 'entrega' ? 'badge badge--exito' : 'badge badge--info';
  }

  protected etiquetaEvento(tipoEvento: TipoEvento): string {
    return tipoEvento === 'entrega' ? 'Entrega' : 'Devolución';
  }
}
