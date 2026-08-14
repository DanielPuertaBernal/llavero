import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { disponibilidadQueryKeys } from './disponibilidad-query-keys';
import type { SalonLookup } from './disponibilidad.models';

const API = environment.apiBaseUrl;

/**
 * Único catálogo de apoyo que esta feature necesita: `GET /api/catalogos/
 * salones`, para poblar el selector de salón de la vista (ver
 * `disponibilidad-vista.component.ts`) y resolver `salon_id` a un nombre
 * legible.
 *
 * A diferencia de `ReservasLookupsService`, acá no hay lookup de personas: el
 * contrato de disponibilidad expone `responsable_id` en cada ocupación, pero
 * esta vista no lo resuelve a nombre — el foco de RF14 es el HORARIO y los
 * CONFLICTOS entre las tres fuentes, no quién es el responsable de cada una.
 *
 * Nota de arquitectura — mismo criterio que `reservas-lookups.service.ts`:
 * consumir `GET /api/catalogos/salones` es la API pública HTTP de otro módulo
 * del backend, no el TypeScript de `features/catalogos` (prohibido, ver
 * front/README.md).
 *
 * Solo lectura: esta feature nunca crea ni edita salones, así que no hay
 * mutaciones ni `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class DisponibilidadLookupsService {
  private readonly http = inject(HttpClient);

  readonly salones = injectQuery(() => ({
    queryKey: disponibilidadQueryKeys.lookupSalones,
    queryFn: () => firstValueFrom(this.http.get<SalonLookup[]>(`${API}/catalogos/salones`)),
  }));

  /** Salones tal como los devuelve el backend, sin ordenar ni filtrar. */
  readonly listaSalones = computed(() => this.salones.data() ?? []);

  /** Opciones ya formateadas para el `p-select` del salón. */
  readonly opcionesSalones = computed(() =>
    (this.salones.data() ?? []).map((salon) => ({ label: salon.nombre, value: salon.id })),
  );

  // El resolutor devuelve el id crudo como respaldo mientras el lookup no
  // haya cargado (o si el id no está en la lista): la vista siempre muestra
  // algo, nunca una celda vacía ni un "undefined".
  nombreSalon(salonId: string): string {
    return this.salones.data()?.find((salon) => salon.id === salonId)?.nombre ?? salonId;
  }
}
