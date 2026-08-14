import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { configuracionQueryKeys } from './configuracion-query-keys';
import type { UbicacionLookup } from './configuracion.models';

const API = environment.apiBaseUrl;

/**
 * Único catálogo de apoyo que esta feature necesita: `GET /api/catalogos/
 * ubicaciones`, para poblar el selector de ubicación por defecto del
 * formulario (ver `configuracion-form.component.ts`).
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): lo prohibido es importar el
 * TypeScript de `features/catalogos`; llamar a
 * `GET /api/catalogos/ubicaciones` es consumir la API pública HTTP de otro
 * módulo del backend, exactamente lo mismo que hace cualquier cliente. Por
 * eso esta consulta vive acá, con sus propios tipos (`configuracion.
 * models.ts`) y su propia clave de caché (`configuracion-query-keys.ts`), en
 * vez de reusar servicios de otras features.
 *
 * Solo lectura: esta feature nunca crea ni edita ubicaciones — no hay
 * mutaciones acá, y por lo tanto tampoco un `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionLookupsService {
  private readonly http = inject(HttpClient);

  readonly ubicaciones = injectQuery(() => ({
    queryKey: configuracionQueryKeys.lookupUbicaciones,
    queryFn: () =>
      firstValueFrom(this.http.get<UbicacionLookup[]>(`${API}/catalogos/ubicaciones`)),
  }));

  /** Opciones ya formateadas para el `p-select` de ubicación por defecto. */
  readonly opcionesUbicaciones = computed(() =>
    (this.ubicaciones.data() ?? []).map((ubicacion) => ({
      label: ubicacion.nombre,
      value: ubicacion.id,
    })),
  );

  // El resolutor devuelve el id crudo como respaldo mientras el lookup no
  // haya cargado (o si el id no está en la lista): la vista siempre muestra
  // algo, nunca una celda vacía ni un "undefined".
  nombreUbicacion(ubicacionId: string): string {
    return (
      this.ubicaciones.data()?.find((ubicacion) => ubicacion.id === ubicacionId)?.nombre ??
      ubicacionId
    );
  }
}
