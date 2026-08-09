import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectMutation, injectQuery, injectQueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import type { TipoSilleteria, TipoSilleteriaInput } from '../catalogos.models';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/tipos-silleteria`;

/**
 * Servicio de datos de `TipoSilleteria` (`GET/POST/PATCH/DELETE
 * /api/catalogos/tipos-silleteria`). Catálogo de apoyo sin vista propia,
 * gestionado desde un sub-componente dentro de la vista de Salones (ver
 * salones/tipos-silleteria-manager.component.ts).
 *
 * `tipo_silleteria_id` es un campo de `Salon` — igual que con `Bloque`,
 * mutar este catálogo también invalida `salones` (a diferencia del
 * frontend legacy, que NO lo hacía: ver
 * AulaSync/analisis/frontend/catalogos.md §8, "Invalidación de cache
 * asimétrica", bug que se corrige acá).
 */
@Injectable({ providedIn: 'root' })
export class TiposSilleteriaService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly tiposSilleteria = injectQuery(() => ({
    queryKey: catalogosQueryKeys.tiposSilleteria,
    queryFn: () => firstValueFrom(this.http.get<TipoSilleteria[]>(BASE_URL)),
  }));

  readonly crear = injectMutation(() => ({
    mutationFn: (input: TipoSilleteriaInput) =>
      firstValueFrom(this.http.post<TipoSilleteria>(BASE_URL, input)),
    onSuccess: () => this.invalidar(),
  }));

  readonly actualizar = injectMutation(() => ({
    mutationFn: (variables: { id: string } & Partial<TipoSilleteriaInput>) => {
      const { id, ...cambios } = variables;
      return firstValueFrom(this.http.patch<TipoSilleteria>(`${BASE_URL}/${id}`, cambios));
    },
    onSuccess: () => this.invalidar(),
  }));

  readonly eliminar = injectMutation(() => ({
    mutationFn: (id: string) => firstValueFrom(this.http.delete<void>(`${BASE_URL}/${id}`)),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: catalogosQueryKeys.tiposSilleteria });
    this.queryClient.invalidateQueries({ queryKey: catalogosQueryKeys.salones });
  }
}
