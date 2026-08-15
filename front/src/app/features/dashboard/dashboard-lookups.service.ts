import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { dashboardQueryKeys } from './dashboard-query-keys';
import type { UsuarioLookup } from './dashboard.models';

const API = environment.apiBaseUrl;

/**
 * Único catálogo de apoyo que la tarjeta de "Actividad reciente" necesita:
 * `GET /api/usuarios/` (`UsuarioOut`, back/usuarios/controller.py), para
 * resolver `procesado_por_id` a un nombre legible.
 *
 * Nota de arquitectura -- igual que `historial-lookups.service.ts`: consumir
 * el endpoint HTTP público de otro módulo del backend no es importar el
 * TypeScript de otra feature (regla dura, ver front/README.md). A diferencia
 * de `HistorialLookupsService` (que resuelve CUATRO catálogos porque su
 * columna "detalle" muestra salón/docente/reclamado-por/solicitante/
 * equipos), este panel solo lista tipo de recurso, tipo de evento, fecha y
 * quién procesó -- el resto del detalle vive en la vista de Historial, a la
 * que este panel enlaza (ver dashboard-resumen.component.ts).
 */
@Injectable({ providedIn: 'root' })
export class DashboardLookupsService {
  private readonly http = inject(HttpClient);

  readonly usuarios = injectQuery(() => ({
    queryKey: dashboardQueryKeys.lookupUsuarios,
    queryFn: () => firstValueFrom(this.http.get<UsuarioLookup[]>(`${API}/usuarios/`)),
  }));

  // Respaldo al id crudo mientras el lookup no haya cargado (o si el id no
  // está en la lista): la fila siempre muestra algo, nunca un "undefined" --
  // mismo criterio que `HistorialLookupsService.nombreUsuario`.
  nombreUsuario(usuarioId: string): string {
    return this.usuarios.data()?.find((usuario) => usuario.id === usuarioId)?.nombre ?? usuarioId;
  }
}
