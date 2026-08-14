import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { comunidadQueryKeys } from './comunidad-query-keys';
import type { TipoPersonaLookup } from './comunidad.models';

const API = environment.apiBaseUrl;

/**
 * Único catálogo de apoyo que esta feature necesita: GET /api/catalogos/
 * tipos-persona (endpoint verificado en back/catalogos/controller.py -- el
 * nombre real de la ruta es tipos-persona, no tipo-persona ni
 * tipos_persona), para resolver a nombre legible el tipo_persona_id
 * crudo que trae ComunidadOut, mismo criterio que UsuariosLookupsService
 * resuelve rol_id/ubicacion_id.
 *
 * Nota de arquitectura -- igual que en usuarios-lookups.service.ts: llamar
 * a GET /api/catalogos/tipos-persona es consumir la API publica HTTP de
 * otro modulo del backend, no el TypeScript de features/catalogos
 * (prohibido, ver front/README.md). Por eso este lookup tiene sus propios
 * tipos (comunidad.models.ts) y su propia clave de cache
 * (comunidad-query-keys.ts) en vez de reusar los de catalogos.
 *
 * Solo lectura: esta feature nunca crea ni edita tipos de persona -- no hay
 * mutaciones aca, y por lo tanto tampoco un invalidar().
 */
@Injectable({ providedIn: 'root' })
export class ComunidadLookupsService {
  private readonly http = inject(HttpClient);

  readonly tiposPersona = injectQuery(() => ({
    queryKey: comunidadQueryKeys.lookupTiposPersona,
    queryFn: () =>
      firstValueFrom(this.http.get<TipoPersonaLookup[]>(`${API}/catalogos/tipos-persona`)),
  }));

  readonly listaTiposPersona = computed(() => this.tiposPersona.data() ?? []);

  nombreTipoPersona(tipoPersonaId: string): string {
    return (
      this.tiposPersona.data()?.find((tipo) => tipo.id === tipoPersonaId)?.nombre ??
      tipoPersonaId
    );
  }
}
