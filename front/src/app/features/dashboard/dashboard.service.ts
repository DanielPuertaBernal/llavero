import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { resolverNombreRol } from '../../core/auth/rol-resolver';
import { environment } from '../../../environments/environment';
import { dashboardQueryKeys } from './dashboard-query-keys';
import type {
  EventoRecienteDto,
  LlaveResumen,
  NotificacionResumen,
  NovedadResumen,
  PrestamoResumen,
  ReservaResumen,
} from './dashboard.models';

const API = environment.apiBaseUrl;

/**
 * Servicio de datos del panel de resumen (Dashboard, decimocuarta y última
 * feature del frontend -- ver la nota de alcance completa en
 * `dashboard.models.ts` para por qué NO existe un `back/dashboard/` propio).
 *
 * Combina, client-side, seis `GET /` de solo lectura ya expuestos por sus
 * features dueñas:
 *
 * - `GET /api/llaves/` -> KPI "Llaves fuera" (estado != `entregado`).
 * - `GET /api/prestamos/` -> KPI "Préstamos activos" (`activo` +
 *   `parcialmente_devuelto`).
 * - `GET /api/novedades/` -> KPI "Novedades abiertas" (`abierta`).
 * - `GET /api/notificaciones/` -> KPI "Notificaciones fallidas" (`fallido`).
 * - `GET /api/reservas/` -> KPI "Reservas de hoy" (`aprobada` con `fecha`
 *   igual a la fecha LOCAL de hoy -- mismo cálculo de fecha local que
 *   `disponibilidad-vista.component.ts` usa para no desplazar el día en
 *   Colombia, UTC-5).
 * - `GET /api/historial/` -> tarjeta "Actividad reciente" (últimos eventos).
 *
 * Nota de diseño -- RF28 aplicado también aquí: la tarjeta de actividad
 * reciente reusa el MISMO criterio de `HistorialService` (Portero ve solo lo
 * que él procesó; Administrador/Auxiliar ven todo), incluida la resolución
 * de rol vía `resolverNombreRol` y el fallback fail-SAFE (si la resolución
 * de rol falla, se filtra por el usuario actual en vez de arriesgarse a
 * exponer de más) -- ver la nota de diseño completa en
 * `historial.service.ts`, no se repite aquí. Los cinco KPI, en cambio, NO se
 * filtran por usuario: son conteos agregados de todo el sistema (ningún rol
 * queda excluido de verlos), a diferencia del historial detallado, donde
 * cada FILA sí identifica quién procesó qué.
 *
 * Nota de diseño -- sin `invalidar()` propio: las cinco queries de KPI
 * comparten clave de caché con la lista "sin filtro" de su feature dueña
 * (ver dashboard-query-keys.ts), así que ya se refrescan solas cuando esa
 * feature invalida su `raiz` tras una mutación. La actividad reciente sí
 * podría quedar desactualizada tras una mutación de otro módulo (crear una
 * llave no invalida `dashboard-actividad-reciente`), pero es una
 * inconsistencia aceptable de "actividad reciente" -- coincide con el
 * `staleTime` por defecto de TanStack, se corrige sola en el próximo
 * refetch o remount del panel, mismo criterio que la nota de diseño de
 * `HistorialService` sobre por qué esa feature tampoco expone mutaciones.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly llaves = injectQuery(() => ({
    queryKey: dashboardQueryKeys.llaves,
    queryFn: () => firstValueFrom(this.http.get<LlaveResumen[]>(`${API}/llaves/`)),
  }));

  readonly prestamos = injectQuery(() => ({
    queryKey: dashboardQueryKeys.prestamos,
    queryFn: () => firstValueFrom(this.http.get<PrestamoResumen[]>(`${API}/prestamos/`)),
  }));

  readonly novedades = injectQuery(() => ({
    queryKey: dashboardQueryKeys.novedades,
    queryFn: () => firstValueFrom(this.http.get<NovedadResumen[]>(`${API}/novedades/`)),
  }));

  readonly notificaciones = injectQuery(() => ({
    queryKey: dashboardQueryKeys.notificaciones,
    queryFn: () => firstValueFrom(this.http.get<NotificacionResumen[]>(`${API}/notificaciones/`)),
  }));

  readonly reservas = injectQuery(() => ({
    queryKey: dashboardQueryKeys.reservas,
    queryFn: () => firstValueFrom(this.http.get<ReservaResumen[]>(`${API}/reservas/`)),
  }));

  // -- Actividad reciente (RF27/RF28, mismo patrón que HistorialService) --

  readonly rolActual = injectQuery(() => {
    const usuario = this.authService.currentUser();
    return {
      queryKey: dashboardQueryKeys.rolActual(usuario?.rolId ?? null),
      queryFn: () => resolverNombreRol(this.http, usuario ? usuario.rolId : ''),
      enabled: !!usuario,
    };
  });

  readonly esPortero = computed(
    () => this.rolActual.isError() || this.rolActual.data() === 'Portero',
  );

  private readonly usuarioIdFiltro = computed<string | null>(() => {
    const usuario = this.authService.currentUser();
    if (!usuario) {
      return null;
    }
    return this.esPortero() ? usuario.id : null;
  });

  readonly actividadReciente = injectQuery(() => {
    const usuario = this.authService.currentUser();
    const rolResuelto = this.rolActual.isSuccess() || this.rolActual.isError();
    const filtro = this.usuarioIdFiltro();
    const url = filtro ? `${API}/historial/?usuario_id=${filtro}` : `${API}/historial/`;
    return {
      queryKey: dashboardQueryKeys.actividadReciente(filtro),
      queryFn: () => firstValueFrom(this.http.get<EventoRecienteDto[]>(url)),
      enabled: !!usuario && rolResuelto,
    };
  });

  // -- KPIs derivados -- cada uno `null` mientras su query de origen está
  // pendiente o en error, para que el componente distinga "todavía no sé"
  // de "cero" (ver dashboard-resumen.component.ts).

  readonly llavesFuera = computed(() => {
    if (!this.llaves.isSuccess()) {
      return null;
    }
    return this.llaves.data().filter((llave) => llave.estado !== 'entregado').length;
  });

  readonly prestamosActivos = computed(() => {
    if (!this.prestamos.isSuccess()) {
      return null;
    }
    return this.prestamos
      .data()
      .filter((prestamo) => prestamo.estado === 'activo' || prestamo.estado === 'parcialmente_devuelto')
      .length;
  });

  readonly novedadesAbiertas = computed(() => {
    if (!this.novedades.isSuccess()) {
      return null;
    }
    return this.novedades.data().filter((novedad) => novedad.estado === 'abierta').length;
  });

  readonly notificacionesFallidas = computed(() => {
    if (!this.notificaciones.isSuccess()) {
      return null;
    }
    return this.notificaciones
      .data()
      .filter((notificacion) => notificacion.estado_envio === 'fallido').length;
  });

  readonly reservasDeHoy = computed(() => {
    if (!this.reservas.isSuccess()) {
      return null;
    }
    const hoy = aFechaIso(new Date());
    return this.reservas
      .data()
      .filter((reserva) => reserva.estado === 'aprobada' && reserva.fecha === hoy).length;
  });

  /** Últimos 5 eventos de `actividadReciente`, ya ordenados por
   * `fecha_hora` descendente desde el backend (mismo contrato que
   * `HistorialService.eventos`, ver su nota de diseño). */
  readonly ultimosEventos = computed(() => (this.actividadReciente.data() ?? []).slice(0, 5));
}

/** `Date` -> `YYYY-MM-DD` tomando los componentes LOCALES (copia de
 * `disponibilidad-vista.component.ts`: `toISOString()` desplazaría el día
 * en Colombia, UTC-5). */
function aFechaIso(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}
