import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectMutation, injectQuery, injectQueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import type { Salon, SalonInput } from '../catalogos.models';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/salones`;

/**
 * Servicio de datos de `Salon` (`GET/POST/PATCH/DELETE
 * /api/catalogos/salones`). Sus propias mutaciones solo invalidan
 * `salones` — son bloques/tipos-silleteria quienes, al mutar, invalidan
 * también `salones` (ver bloques.service.ts / tipos-silleteria.service.ts),
 * no al revés.
 */
@Injectable({ providedIn: 'root' })
export class SalonesService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly salones = injectQuery(() => ({
    queryKey: catalogosQueryKeys.salones,
    queryFn: () => firstValueFrom(this.http.get<Salon[]>(BASE_URL)),
  }));

  readonly crear = injectMutation(() => ({
    mutationFn: (input: SalonInput) => firstValueFrom(this.http.post<Salon>(BASE_URL, input)),
    onSuccess: () => this.invalidar(),
  }));

  readonly actualizar = injectMutation(() => ({
    mutationFn: (variables: { id: string } & Partial<SalonInput>) => {
      const { id, ...cambios } = variables;
      return firstValueFrom(this.http.patch<Salon>(`${BASE_URL}/${id}`, cambios));
    },
    onSuccess: () => this.invalidar(),
  }));

  readonly eliminar = injectMutation(() => ({
    mutationFn: (id: string) => firstValueFrom(this.http.delete<void>(`${BASE_URL}/${id}`)),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: catalogosQueryKeys.salones });
  }
}
