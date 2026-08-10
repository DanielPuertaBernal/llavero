import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { prestamosQueryKeys } from './prestamos-query-keys';
import type {
  Devolucion,
  DevolucionInput,
  EstadoPrestamo,
  Prestamo,
  PrestamoInput,
} from './prestamos.models';

const BASE_URL = `${environment.apiBaseUrl}/prestamos`;

/**
 * Servicio de datos de `Prestamo` (ver back/prestamos/controller.py).
 *
 * A diferencia de los servicios de `catalogos`, acá NO hay `actualizar` ni
 * `eliminar`: el backend no expone PATCH ni DELETE sobre préstamos. Un
 * préstamo es un evento de ciclo de vida — se crea con la entrega de N
 * equipos (`POST /api/prestamos/`) y avanza con una o varias devoluciones
 * (`POST /api/prestamos/{id}/devolver`), que son transiciones de estado, no
 * ediciones de campos.
 *
 * Nota de diseño — el filtro por estado vive acá y no en el componente:
 * `GET /api/prestamos/estado/{estado}` es un endpoint distinto de
 * `GET /api/prestamos/`, así que filtrar es una consulta al SERVIDOR, no un
 * `filter()` sobre la lista ya cargada. `filtroEstado` es la señal que elige
 * cuál de los dos endpoints alimenta `prestamos`: la función de opciones de
 * `injectQuery` se re-evalúa sola cuando la señal cambia (integración
 * reactiva de TanStack con signals), cambiando a la vez `queryKey` y
 * `queryFn`. Como la clave cambia, cada estado conserva su propia entrada de
 * caché en vez de pisarse entre sí.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['prestamos']`, no una
 * clave puntual, y en esta feature eso es obligatorio: una devolución cambia
 * TRES cosas a la vez — el `estado` del préstamo (y por lo tanto en qué
 * lista por estado aparece), el `estado_equipo` de sus detalles, y la lista
 * de sus devoluciones. Las tres cuelgan de `['prestamos']` justamente para
 * poder refrescarlas con una sola invalidación (ver prestamos-query-keys.ts).
 */
@Injectable({ providedIn: 'root' })
export class PrestamosService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  /** `null` = sin filtro (lista completa). */
  readonly filtroEstado = signal<EstadoPrestamo | null>(null);

  readonly prestamos = injectQuery(() => {
    const estado = this.filtroEstado();
    return {
      queryKey: estado ? prestamosQueryKeys.porEstado(estado) : prestamosQueryKeys.lista,
      queryFn: () =>
        firstValueFrom(
          this.http.get<Prestamo[]>(estado ? `${BASE_URL}/estado/${estado}` : `${BASE_URL}/`),
        ),
    };
  });

  readonly crear = injectMutation(() => ({
    mutationFn: (input: PrestamoInput) =>
      firstValueFrom(this.http.post<Prestamo>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  // La respuesta de `POST /{id}/devolver` es una `DevolucionOut`, no el
  // préstamo actualizado: el estado nuevo del préstamo se ve tras la
  // invalidación, no en el cuerpo de esta respuesta.
  readonly devolverEquipos = injectMutation(() => ({
    mutationFn: (variables: { id: string } & DevolucionInput) => {
      const { id, ...payload } = variables;
      return firstValueFrom(this.http.post<Devolucion>(`${BASE_URL}/${id}/devolver`, payload));
    },
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: prestamosQueryKeys.raiz });
  }
}
