import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectMutation, injectQuery, injectQueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import type { Ubicacion, UbicacionInput } from '../catalogos.models';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/ubicaciones`;

/**
 * Servicio de datos de `Ubicacion` (`GET/POST/PATCH/DELETE
 * /api/catalogos/ubicaciones`). A diferencia de bloques/tipos-silleteria,
 * `Ubicacion` no es un campo denormalizado en otra entidad de este
 * catálogo — sus mutaciones solo invalidan su propia queryKey.
 */
@Injectable({ providedIn: 'root' })
export class UbicacionesService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly ubicaciones = injectQuery(() => ({
    queryKey: catalogosQueryKeys.ubicaciones,
    queryFn: () => firstValueFrom(this.http.get<Ubicacion[]>(BASE_URL)),
  }));

  readonly crear = injectMutation(() => ({
    mutationFn: (input: UbicacionInput) =>
      firstValueFrom(this.http.post<Ubicacion>(BASE_URL, input)),
    onSuccess: () => this.invalidar(),
  }));

  readonly actualizar = injectMutation(() => ({
    mutationFn: (variables: { id: string } & Partial<UbicacionInput>) => {
      const { id, ...cambios } = variables;
      return firstValueFrom(this.http.patch<Ubicacion>(`${BASE_URL}/${id}`, cambios));
    },
    onSuccess: () => this.invalidar(),
  }));

  readonly eliminar = injectMutation(() => ({
    mutationFn: (id: string) => firstValueFrom(this.http.delete<void>(`${BASE_URL}/${id}`)),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: catalogosQueryKeys.ubicaciones });
  }
}
