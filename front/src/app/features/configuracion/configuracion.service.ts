import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { configuracionQueryKeys } from './configuracion-query-keys';
import type { Configuracion, ConfiguracionInput } from './configuracion.models';

const BASE_URL = `${environment.apiBaseUrl}/configuracion`;

/**
 * Servicio de datos de la configuración global (ver
 * back/configuracion/controller.py).
 *
 * A diferencia de todas las demás features, esta es un SINGLETON: no hay
 * `crear` ni `eliminar`, solo `configuracion` (GET) y `actualizar` (PUT).
 *
 * - `GET /api/configuracion/` es un get-or-create del lado del backend y
 *   NUNCA devuelve 404 (ver el docstring de `controller.py`), así que esta
 *   consulta no necesita un `enabled` condicional ni un caso "no existe
 *   todavía": la fila siempre está.
 * - `PUT /api/configuracion/` reemplaza los 5 campos completos (no un PATCH
 *   parcial): el formulario siempre manda el objeto entero.
 *
 * Nota de alcance deliberada — `POST /api/configuracion/` existe en el
 * backend pero NO se expone acá: el GET ya garantiza que la fila existe para
 * cuando un operador abre esta pantalla, así que no hay caso de uso
 * legítimo para crear una segunda configuración desde esta UI.
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly configuracion = injectQuery(() => ({
    queryKey: configuracionQueryKeys.raiz,
    queryFn: () => firstValueFrom(this.http.get<Configuracion>(`${BASE_URL}/`)),
  }));

  readonly actualizar = injectMutation(() => ({
    mutationFn: (input: ConfiguracionInput) =>
      firstValueFrom(this.http.put<Configuracion>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: configuracionQueryKeys.raiz });
  }
}
