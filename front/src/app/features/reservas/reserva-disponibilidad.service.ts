import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { DisponibilidadSalonAgenda } from './reserva-disponibilidad.models';

const BASE_URL = `${environment.apiBaseUrl}/disponibilidad`;

/**
 * Servicio de datos MÍNIMO para el panel "Agenda de disponibilidad" del
 * diálogo de registro de reserva individual
 * (`reserva-agenda-disponibilidad.component.ts`): consulta el mismo endpoint
 * de solo lectura que `features/disponibilidad`
 * (`GET /api/disponibilidad/salon/{salon_id}?fecha=<YYYY-MM-DD>`, RF14), pero
 * NO importa `DisponibilidadService` — ninguna feature importa el TypeScript
 * de otra, ver la nota de duplicación deliberada en
 * `reserva-disponibilidad.models.ts` y `front/README.md`.
 *
 * Reactivo a `salonId`/`fecha` igual que `DisponibilidadService`: la función
 * de opciones de `injectQuery` se reevalúa sola cuando cualquiera cambia.
 * `enabled` exige AMBOS (a diferencia de la vista completa de
 * `disponibilidad`, que admite "sin fecha"): el panel solo tiene sentido una
 * vez que el operador ya eligió salón y fecha en el formulario de reserva.
 */
@Injectable({ providedIn: 'root' })
export class ReservaDisponibilidadService {
  private readonly http = inject(HttpClient);

  readonly salonId = signal<string | null>(null);
  readonly fecha = signal<string | null>(null);

  readonly agenda = injectQuery(() => {
    const salonId = this.salonId();
    const fecha = this.fecha();
    return {
      queryKey: ['reserva-agenda', salonId, fecha] as const,
      queryFn: () =>
        firstValueFrom(
          this.http.get<DisponibilidadSalonAgenda>(`${BASE_URL}/salon/${salonId}?fecha=${fecha}`),
        ),
      enabled: !!salonId && !!fecha,
    };
  });
}
