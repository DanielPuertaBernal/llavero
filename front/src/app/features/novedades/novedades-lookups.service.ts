import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { novedadesQueryKeys } from './novedades-query-keys';
import type { UsuarioLookup } from './novedades.models';

const API = environment.apiBaseUrl;

/**
 * Catálogo de apoyo que la feature `novedades` necesita para resolver a
 * nombre legible la FK que `NovedadOut` devuelve como UUID crudo
 * (`registrado_por_id`).
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): lo prohibido es importar el
 * TypeScript de `features/usuarios`; llamar a `GET /api/usuarios/` es
 * consumir la API pública HTTP de otro módulo del backend, exactamente el
 * mismo endpoint que ya usa `UsuariosService.usuarios` para su propio padrón.
 * Por eso esta consulta vive acá, con su propio tipo (`UsuarioLookup` en
 * `novedades.models.ts`) y su propia clave de caché
 * (`novedades-query-keys.ts`), en vez de reusar `UsuariosService`.
 *
 * Solo lectura: esta feature nunca crea ni edita usuarios — no hay
 * mutaciones acá, y por lo tanto tampoco un `invalidar()`. Administrar el
 * padrón de operadores es asunto de `features/usuarios`, no de esta vista.
 */
@Injectable({ providedIn: 'root' })
export class NovedadesLookupsService {
  private readonly http = inject(HttpClient);

  readonly usuarios = injectQuery(() => ({
    queryKey: novedadesQueryKeys.lookupUsuarios,
    queryFn: () => firstValueFrom(this.http.get<UsuarioLookup[]>(`${API}/usuarios/`)),
  }));

  /**
   * Sin lookup cargado (o ante un id que no está en la lista) se devuelve el
   * id crudo como respaldo: la tabla siempre muestra algo, nunca una celda
   * vacía ni un "undefined" (mismo criterio que
   * `UsuariosLookupsService.nombreRol`).
   */
  nombreUsuario(usuarioId: string): string {
    return this.usuarios.data()?.find((usuario) => usuario.id === usuarioId)?.nombre ?? usuarioId;
  }
}
