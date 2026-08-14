import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { resolverNombreRol } from '../../core/auth/rol-resolver';
import { environment } from '../../../environments/environment';
import { historialQueryKeys } from './historial-query-keys';
import type { EventoHistorial } from './historial.models';

const BASE_URL = `${environment.apiBaseUrl}/historial`;

/**
 * Servicio de datos de RF27 (historial de entregas/devoluciones de llaves y
 * equipos). Único endpoint del contrato:
 * `GET /api/historial/?usuario_id=<uuid opcional>` (ver la especificación de
 * la tarea -- ese módulo del backend vive en el worktree
 * `feature/backend/historial`, todavía no mezclado en `develop`).
 *
 * Nota de alcance -- SOLO LECTURA (mismo criterio que `comunidad` y
 * `disponibilidad`): no hay ningún `crear`/mutación ni `invalidar()`, porque
 * el contrato no expone nada más que este único GET.
 *
 * Nota de diseño -- RF28 (Portero ve solo lo que él procesó, Administrador/
 * Auxiliar ven todo): el backend NO conoce el rol de quien llama ni hace
 * ninguna autorización -- decidir cuándo mandar `usuario_id` es enteramente
 * responsabilidad de este servicio. Como `AuthService.currentUser()` solo
 * expone `rolId` (un UUID, ver auth.models.ts), este servicio resuelve el
 * nombre del rol con `resolverNombreRol` (ver core/auth/rol-resolver.ts,
 * extraída de `rol.guard.ts` para no duplicar la llamada a
 * `GET /api/catalogos/roles` ni la búsqueda por id entre ese guard y este
 * servicio).
 *
 * Nota de diseño -- por qué la resolución de rol vive en su propio
 * `injectQuery` (`rolActual`) en vez de resolverse una sola vez de forma
 * imperativa: igual que `DisponibilidadService.disponibilidad` es reactivo a
 * signals, acá `eventos` necesita reevaluarse solo si el usuario autenticado
 * cambia (login/logout) -- usar TanStack Query para la propia resolución de
 * rol (en vez de un `signal` set a mano) deja que el `enabled` de `eventos`
 * espere a que la resolución termine (éxito O error) antes de disparar el
 * GET de la lista, sin necesitar un `await` fuera del ciclo reactivo de
 * Angular.
 *
 * Nota de diseño -- fail-SAFE, no fail-cerrado: a diferencia de
 * `rol.guard.ts` (que bloquea la navegación completa si no puede confirmar
 * el rol), esta ruta NO está bloqueada por rol -- todo usuario autenticado
 * puede entrar a `/historial` (ver app.routes.ts), cada uno viendo su
 * subconjunto. Por eso, si `resolverNombreRol` falla (red caída, backend
 * caído), este servicio NO bloquea la vista: en vez de arriesgarse a mostrar
 * el historial COMPLETO a alguien que podría ser Portero, `esPortero()` cae
 * al lado más restrictivo (filtra por el usuario actual) hasta que la
 * resolución de rol se pueda reintentar. Es la opción de menor privilegio
 * por defecto, igual en espíritu al "falla cerrado" del guard pero adaptada
 * a una ruta que nunca debe bloquear la entrada.
 */
@Injectable({ providedIn: 'root' })
export class HistorialService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly rolActual = injectQuery(() => {
    const usuario = this.authService.currentUser();
    return {
      queryKey: historialQueryKeys.rolActual(usuario?.rolId ?? null),
      queryFn: () => resolverNombreRol(this.http, usuario ? usuario.rolId : ''),
      enabled: !!usuario,
    };
  });

  /**
   * `true` cuando el rol resuelto es Portero, o cuando la resolución de rol
   * falló (ver la nota de diseño "fail-SAFE" arriba: se prefiere restringir
   * de más que exponer de más). `false` mientras la resolución está en curso
   * o cuando el rol resuelto es Administrador/Auxiliar.
   */
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

  readonly eventos = injectQuery(() => {
    const usuario = this.authService.currentUser();
    const rolResuelto = this.rolActual.isSuccess() || this.rolActual.isError();
    const filtro = this.usuarioIdFiltro();
    const url = filtro ? `${BASE_URL}/?usuario_id=${filtro}` : `${BASE_URL}/`;
    return {
      queryKey: historialQueryKeys.lista(filtro),
      queryFn: () => firstValueFrom(this.http.get<EventoHistorial[]>(url)),
      enabled: !!usuario && rolResuelto,
    };
  });
}
