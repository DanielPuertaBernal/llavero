import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { reservasQueryKeys } from './reservas-query-keys';
import type { PersonaLookup, SalonLookup } from './reservas.models';

const API = environment.apiBaseUrl;

/**
 * Catálogos de apoyo que la feature `reservas` necesita para (a) resolver a
 * nombre legible las dos FKs que `ReservaIndividualOut` devuelve como UUID
 * crudo (`salon_id`, `solicitante_id`) y (b) poblar los selectores del
 * diálogo de registro y del filtro por solicitante.
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): lo prohibido es importar el
 * TypeScript de `features/catalogos`; llamar a
 * `GET /api/catalogos/salones` es consumir la API pública HTTP de otro módulo
 * del backend, exactamente lo mismo que hace cualquier cliente. Por eso estas
 * consultas viven acá, con sus propios tipos (`reservas.models.ts`) y sus
 * propias claves de caché (`reservas-query-keys.ts`), en vez de reusar
 * servicios de otras features.
 *
 * Son solo dos lookups (contra los cinco de `prestamos`) porque
 * `ReservaIndividualOut` solo tiene dos FKs: no hay usuario operador ni
 * ubicación en el schema de reserva — la reserva la pide una persona de
 * comunidad para un salón, y punto.
 *
 * Solo lectura: esta feature nunca crea ni edita personas ni salones — no hay
 * mutaciones acá, y por lo tanto tampoco un `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class ReservasLookupsService {
  private readonly http = inject(HttpClient);

  readonly personas = injectQuery(() => ({
    queryKey: reservasQueryKeys.lookupPersonas,
    queryFn: () => firstValueFrom(this.http.get<PersonaLookup[]>(`${API}/comunidad/`)),
  }));

  readonly salones = injectQuery(() => ({
    queryKey: reservasQueryKeys.lookupSalones,
    queryFn: () => firstValueFrom(this.http.get<SalonLookup[]>(`${API}/catalogos/salones`)),
  }));

  /**
   * Salones tal como los devuelve el backend, sin ordenar ni filtrar. A
   * diferencia de `PrestamosLookupsService.ubicacionesPrestamo`, acá no hay
   * ningún flag por el cual priorizar unos sobre otros: `SalonOut` no declara
   * permiso alguno de reserva (ver back/catalogos/controller.py) y
   * `reservas.service.crear_reserva` solo valida que el salón EXISTA.
   * Inventar acá un criterio que el dominio no tiene sería peor que no
   * ordenar. Tampoco se ocultan los salones ocupados: la disponibilidad
   * depende de la fecha y la franja, y la decide el backend con su 400 por
   * solapamiento.
   */
  readonly listaSalones = computed(() => this.salones.data() ?? []);

  // Opciones ya formateadas para los selectores. Viven acá (y no en cada
  // componente) porque el selector de solicitante se usa tanto en el filtro
  // de la lista como en el diálogo de registro: una sola definición, una sola
  // forma de etiquetar.
  readonly opcionesPersonas = computed(() =>
    (this.personas.data() ?? []).map((persona) => ({
      // El documento desambigua homónimos, frecuentes en una comunidad
      // universitaria grande.
      label: `${persona.nombre} (${persona.numero_documento})`,
      value: persona.id,
    })),
  );

  // Los resolutores devuelven el id crudo como respaldo mientras el lookup no
  // haya cargado (o si el id no está en la lista): la tabla siempre muestra
  // algo, nunca una celda vacía ni un "undefined".
  nombrePersona(personaId: string): string {
    return this.personas.data()?.find((persona) => persona.id === personaId)?.nombre ?? personaId;
  }

  nombreSalon(salonId: string): string {
    return this.salones.data()?.find((salon) => salon.id === salonId)?.nombre ?? salonId;
  }
}
