import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { llavesQueryKeys } from './llaves-query-keys';
import type { DevolucionInput, EstadoLlave, Llave, LlaveInput } from './llaves.models';

const BASE_URL = `${environment.apiBaseUrl}/llaves`;

/**
 * Servicio de datos de `Llave` (ver back/llaves/controller.py).
 *
 * A diferencia de los servicios de `catalogos`, acá NO hay `actualizar` ni
 * `eliminar`: el backend no expone PATCH ni DELETE sobre llaves. Una llave
 * es un evento de ciclo de vida — se crea con la entrega
 * (`POST /api/llaves/`) y se cierra con la devolución
 * (`POST /api/llaves/{id}/devolver`), que es una transición de estado, no
 * una edición de campos.
 *
 * Nota de diseño — el filtro por estado vive acá y no en el componente:
 * `GET /api/llaves/estado/{estado}` es un endpoint distinto de
 * `GET /api/llaves/`, así que filtrar es una consulta al SERVIDOR, no un
 * `filter()` sobre la lista ya cargada. `filtroEstado` es la señal que
 * elige cuál de los dos endpoints alimenta `llaves`: la función de opciones
 * de `injectQuery` se re-evalúa sola cuando la señal cambia (integración
 * reactiva de TanStack con signals), cambiando a la vez `queryKey` y
 * `queryFn`. Como la clave cambia, cada estado conserva su propia entrada
 * de caché en vez de pisarse entre sí.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['llaves']`, no una
 * clave puntual: crear o devolver una llave cambia el estado de la fila, y
 * por lo tanto en qué lista por estado aparece. Invalidar solo la lista
 * activa dejaría cacheadas y desactualizadas las demás.
 */
@Injectable({ providedIn: 'root' })
export class LlavesService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  /** `null` = sin filtro (lista completa). */
  readonly filtroEstado = signal<EstadoLlave | null>(null);

  readonly llaves = injectQuery(() => {
    const estado = this.filtroEstado();
    return {
      queryKey: estado ? llavesQueryKeys.porEstado(estado) : llavesQueryKeys.lista,
      queryFn: () =>
        firstValueFrom(
          this.http.get<Llave[]>(estado ? `${BASE_URL}/estado/${estado}` : `${BASE_URL}/`),
        ),
    };
  });

  readonly crear = injectMutation(() => ({
    mutationFn: (input: LlaveInput) => firstValueFrom(this.http.post<Llave>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  readonly devolver = injectMutation(() => ({
    mutationFn: (variables: { id: string } & DevolucionInput) => {
      const { id, ...payload } = variables;
      return firstValueFrom(this.http.post<Llave>(`${BASE_URL}/${id}/devolver`, payload));
    },
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: llavesQueryKeys.raiz });
  }
}
