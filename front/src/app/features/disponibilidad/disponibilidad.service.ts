import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { disponibilidadQueryKeys } from './disponibilidad-query-keys';
import type { DisponibilidadSalon } from './disponibilidad.models';

const BASE_URL = `${environment.apiBaseUrl}/disponibilidad`;

/**
 * Servicio de datos de RF14 (disponibilidad de un salón). Único endpoint del
 * contrato: `GET /api/disponibilidad/salon/{salon_id}?dia=<DiaSemana>&fecha=
 * <YYYY-MM-DD>` (ambos query params opcionales).
 *
 * Nota de diseño — reactivo a DOS signals, `salonId` y `fecha`, igual que
 * `ReservasService.filtroSolicitante`/`filtroEstado` son reactivos: la
 * función de opciones de `injectQuery` se reevalúa sola cuando cualquiera de
 * las dos cambia (integración de TanStack con signals), recalculando a la
 * vez `queryKey` y la URL. Como la clave cambia con la combinación
 * salonId+fecha, cada combinación conserva su propia entrada de caché en vez
 * de pisarse entre sí (ver disponibilidad-query-keys.ts).
 *
 * Nota de diseño — `enabled: !!salonId`: sin salón elegido no hay nada que
 * consultar (el `{salon_id}` es parte de la ruta, no un filtro opcional). La
 * vista arranca sin salón seleccionado, así que esto evita una petición con
 * un id vacío en el primer render.
 *
 * Nota de alcance — esta feature es de solo lectura (RF14: "consultar la
 * disponibilidad"): no hay `crear`/`cancelar` ni `invalidar()` como en
 * `ReservasService`, porque el contrato no expone ninguna mutación.
 *
 * Nota de diseño — el query param `dia` del contrato NO lo dispara este
 * servicio: el caso de uso principal (y el único que exige esfuerzo real,
 * ver la tarea de esta feature) es salón + FECHA concreta, que ya implica el
 * día de la semana (el backend lo resuelve solo). El modo "sin fecha" sigue
 * funcionando (se omite el query param `fecha`), solo que sin fijar `dia`
 * tampoco: sin ninguno de los dos, el backend interpretaría "todos los días",
 * que no es un caso que la vista necesite. Si en el futuro se agrega un
 * selector de día suelto, alcanza con sumar una señal `dia` análoga.
 */
@Injectable({ providedIn: 'root' })
export class DisponibilidadService {
  private readonly http = inject(HttpClient);

  /** `null` = sin salón elegido todavía. */
  readonly salonId = signal<string | null>(null);
  /** `null` = modo "sin fecha" del contrato (recurrentes + todas las individuales, sin conflictos). */
  readonly fecha = signal<string | null>(null);

  readonly disponibilidad = injectQuery(() => {
    const salonId = this.salonId();
    const fecha = this.fecha();
    const url = fecha
      ? `${BASE_URL}/salon/${salonId}?fecha=${fecha}`
      : `${BASE_URL}/salon/${salonId}`;
    return {
      queryKey: disponibilidadQueryKeys.porSalonYFecha(salonId ?? '', fecha),
      queryFn: () => firstValueFrom(this.http.get<DisponibilidadSalon>(url)),
      enabled: !!salonId,
    };
  });
}
