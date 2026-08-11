import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { reservasQueryKeys } from './reservas-query-keys';
import type { Reserva, ReservaInput } from './reservas.models';

const BASE_URL = `${environment.apiBaseUrl}/reservas`;

/**
 * Servicio de datos de `ReservaIndividual` (ver back/reservas/controller.py).
 *
 * Igual que en `prestamos`, acá NO hay `actualizar` ni `eliminar`: el backend
 * no expone PATCH ni DELETE sobre reservas. Una reserva es un evento de ciclo
 * de vida — se crea `aprobada` (`POST /api/reservas/`) y de ahí solo
 * transiciona de estado.
 *
 * Nota de alcance — de las cuatro transiciones del enum, esta feature solo
 * puede disparar UNA: `cancelar`. `completada` es un efecto secundario de
 * `llaves.service.crear_llave` al entregar la llave asociada, y
 * `no_reclamada` la produce el scheduler por tiempo — ninguna de las dos
 * tiene endpoint HTTP (ver el docstring de back/reservas/controller.py, que
 * lo declara explícitamente). No se inventa acá una llamada para ellas.
 *
 * Nota de diseño — el filtro por solicitante vive acá y no en el componente:
 * `GET /api/reservas/solicitante/{id}` es un endpoint distinto de
 * `GET /api/reservas/`, así que filtrar por solicitante es una consulta al
 * SERVIDOR, no un `filter()` sobre la lista ya cargada. `filtroSolicitante`
 * es la señal que elige cuál de los dos endpoints alimenta `reservas`: la
 * función de opciones de `injectQuery` se re-evalúa sola cuando la señal
 * cambia (integración reactiva de TanStack con signals), cambiando a la vez
 * `queryKey` y `queryFn`. Como la clave cambia, cada solicitante conserva su
 * propia entrada de caché en vez de pisarse entre sí.
 *
 * En cambio el filtro por ESTADO no vive acá, a diferencia de
 * `PrestamosService.filtroEstado`: el backend de reservas no expone
 * `GET /estado/{estado}`, así que ese filtro es necesariamente en memoria y
 * pertenece al componente de lista. No se inventa acá un endpoint que no
 * existe ni se simula uno con parámetros de query que el controller ignoraría.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['reservas']`, no una
 * clave puntual: crear o cancelar una reserva desactualiza tanto la lista
 * completa como la lista del solicitante involucrado, y ambas cuelgan de ese
 * prefijo justamente para poder refrescarlas con una sola invalidación (ver
 * reservas-query-keys.ts).
 *
 * Nota de alcance — `GET /api/reservas/{id}` existe en el backend pero esta
 * feature no lo consume: `ReservaIndividualOut` es la MISMA forma completa
 * que ya trae cada elemento de la lista (no hay sub-recursos como los
 * `detalles`/`devoluciones` de un préstamo), así que una consulta de detalle
 * sería un segundo viaje por datos que la fila ya tiene en mano.
 */
@Injectable({ providedIn: 'root' })
export class ReservasService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  /** `null` = sin filtro (lista completa). */
  readonly filtroSolicitante = signal<string | null>(null);

  readonly reservas = injectQuery(() => {
    const solicitanteId = this.filtroSolicitante();
    return {
      queryKey: solicitanteId
        ? reservasQueryKeys.porSolicitante(solicitanteId)
        : reservasQueryKeys.lista,
      queryFn: () =>
        firstValueFrom(
          this.http.get<Reserva[]>(
            solicitanteId ? `${BASE_URL}/solicitante/${solicitanteId}` : `${BASE_URL}/`,
          ),
        ),
    };
  });

  readonly crear = injectMutation(() => ({
    mutationFn: (input: ReservaInput) =>
      firstValueFrom(this.http.post<Reserva>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `POST /api/reservas/{id}/cancelar`. El endpoint no declara schema de
   * entrada, así que se envía `null` como cuerpo en vez de inventar un objeto
   * con campos que el backend ignoraría. La respuesta es la reserva ya
   * `cancelada`, pero la vista la toma de la invalidación, no de este cuerpo.
   */
  readonly cancelar = injectMutation(() => ({
    mutationFn: (variables: { id: string }) =>
      firstValueFrom(this.http.post<Reserva>(`${BASE_URL}/${variables.id}/cancelar`, null)),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: reservasQueryKeys.raiz });
  }
}
