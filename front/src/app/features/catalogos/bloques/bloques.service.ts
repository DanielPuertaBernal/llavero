import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectMutation, injectQuery, injectQueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import type { Bloque, BloqueInput } from '../catalogos.models';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/bloques`;

/**
 * Servicio de datos de `Bloque` (`GET/POST/PATCH/DELETE
 * /api/catalogos/bloques`, ver back/catalogos/controller.py): catálogo de
 * apoyo sin vista propia — se gestiona desde un sub-componente dentro de
 * la vista de Salones (ver salones/bloques-manager.component.ts), igual
 * que en el frontend legacy.
 */
@Injectable({ providedIn: 'root' })
export class BloquesService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly bloques = injectQuery(() => ({
    queryKey: catalogosQueryKeys.bloques,
    queryFn: () => firstValueFrom(this.http.get<Bloque[]>(BASE_URL)),
  }));

  readonly crear = injectMutation(() => ({
    mutationFn: (input: BloqueInput) => firstValueFrom(this.http.post<Bloque>(BASE_URL, input)),
    onSuccess: () => this.invalidar(),
  }));

  readonly actualizar = injectMutation(() => ({
    mutationFn: (variables: { id: string } & Partial<BloqueInput>) => {
      const { id, ...cambios } = variables;
      return firstValueFrom(this.http.patch<Bloque>(`${BASE_URL}/${id}`, cambios));
    },
    onSuccess: () => this.invalidar(),
  }));

  readonly eliminar = injectMutation(() => ({
    mutationFn: (id: string) => firstValueFrom(this.http.delete<void>(`${BASE_URL}/${id}`)),
    onSuccess: () => this.invalidar(),
  }));

  // El nombre del bloque se resuelve en el cliente dentro de la tabla de
  // salones (Salon solo trae `bloque_id`) — invalidar también `salones`
  // para que un rename no deje nombres viejos cacheados (ver
  // catalogos-query-keys.ts).
  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: catalogosQueryKeys.bloques });
    this.queryClient.invalidateQueries({ queryKey: catalogosQueryKeys.salones });
  }
}
