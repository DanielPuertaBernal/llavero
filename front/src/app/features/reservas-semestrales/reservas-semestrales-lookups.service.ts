import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { reservasSemestralesQueryKeys } from './reservas-semestrales-query-keys';
import type { PersonaLookup, SalonLookup, SemestreLookup } from './reservas-semestrales.models';

const API = environment.apiBaseUrl;

/**
 * Catálogos de apoyo que la feature `reservas-semestrales` necesita para (a)
 * resolver a nombre/código legible las TRES FKs que `ReservaSemestralOut`
 * devuelve como UUID crudo (`salon_id`, `solicitante_id`, `semestre_id`) y
 * (b) poblar los selectores del diálogo de registro.
 *
 * Nota de arquitectura — mismo criterio que `ReservasLookupsService` de la
 * feature hermana: consumir `GET /api/catalogos/salones`,
 * `GET /api/comunidad/` y `GET /api/programacion/semestres` es consumir la
 * API pública HTTP de otros módulos del backend, no importar su TypeScript
 * (prohibido, ver front/README.md).
 *
 * Son TRES lookups (contra los dos de `features/reservas`) porque
 * `ReservaSemestralOut` tiene una FK más: `semestre_id`. Una franja semestral
 * no tiene fecha propia — vive dentro de un semestre completo — así que la
 * feature necesita poder mostrar a qué semestre pertenece cada franja.
 *
 * Solo lectura: esta feature nunca crea ni edita personas, salones ni
 * semestres — no hay mutaciones acá, y por lo tanto tampoco un `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class ReservasSemestralesLookupsService {
  private readonly http = inject(HttpClient);

  readonly personas = injectQuery(() => ({
    queryKey: reservasSemestralesQueryKeys.lookupPersonas,
    queryFn: () => firstValueFrom(this.http.get<PersonaLookup[]>(`${API}/comunidad/`)),
  }));

  readonly salones = injectQuery(() => ({
    queryKey: reservasSemestralesQueryKeys.lookupSalones,
    queryFn: () => firstValueFrom(this.http.get<SalonLookup[]>(`${API}/catalogos/salones`)),
  }));

  readonly semestres = injectQuery(() => ({
    queryKey: reservasSemestralesQueryKeys.lookupSemestres,
    queryFn: () =>
      firstValueFrom(this.http.get<SemestreLookup[]>(`${API}/programacion/semestres`)),
  }));

  /**
   * Salones tal como los devuelve el backend, sin ordenar ni filtrar — mismo
   * criterio (y misma justificación) que `ReservasLookupsService.
   * listaSalones` de la feature hermana: `SalonOut` no declara ningún flag de
   * permiso de reserva, y la disponibilidad la decide el backend con su 400
   * por solapamiento.
   */
  readonly listaSalones = computed(() => this.salones.data() ?? []);

  // Opciones ya formateadas para los selectores.
  readonly opcionesPersonas = computed(() =>
    (this.personas.data() ?? []).map((persona) => ({
      // El documento desambigua homónimos, frecuentes en una comunidad
      // universitaria grande.
      label: `${persona.nombre} (${persona.numero_documento})`,
      value: persona.id,
    })),
  );

  /**
   * El código solo (ej. "2026-2") no alcanza para distinguir de un vistazo
   * cuándo empieza y termina: a diferencia del solicitante (donde el nombre
   * ya identifica a la persona y el documento solo desambigua homónimos
   * infrecuentes), acá el rango de fechas es la información que el operador
   * necesita para elegir el semestre correcto sin adivinar. Por eso el label
   * incluye `fecha_inicio`/`fecha_fin` tal como los devuelve el backend
   * (`YYYY-MM-DD`), sin reformatear: son solo referencia visual en un
   * selector, no un valor de negocio que se muestre en la tabla.
   */
  readonly opcionesSemestres = computed(() =>
    (this.semestres.data() ?? []).map((semestre) => ({
      label: `${semestre.codigo} (${semestre.fecha_inicio} - ${semestre.fecha_fin})`,
      value: semestre.id,
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

  codigoSemestre(semestreId: string): string {
    return this.semestres.data()?.find((semestre) => semestre.id === semestreId)?.codigo ?? semestreId;
  }
}
