import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { comunidadQueryKeys } from './comunidad-query-keys';
import type { Persona } from './comunidad.models';

const BASE_URL = `${environment.apiBaseUrl}/comunidad`;

/**
 * Servicio de datos de Persona (RF26, ver back/comunidad/controller.py).
 *
 * Nota de alcance -- DECISION DELIBERADA, no un descuido: este servicio
 * SOLO declara la consulta de lista (GET /api/comunidad/). El backend
 * tambien expone GET /{persona_id}, GET /documento/{numero_documento},
 * GET /carnet/{id_carnet}, POST / y DELETE /{persona_id} (ver el
 * controller), pero NINGUNA mutacion se modela en esta capa ni se ofrece
 * en la UI (ver comunidad-list.component.ts: no hay boton de crear ni de
 * eliminar), por dos razones que se refuerzan entre si:
 *
 * 1. RF25 dice explicitamente que los datos de comunidad "deben
 *    sincronizarse automaticamente desde el sistema institucional, sin
 *    edicion manual dentro de Llavero" (ver back/comunidad/model.py, que
 *    documenta el mismo criterio del lado del ORM: es el catalogo maestro
 *    de personas, alimentado por un ETL externo). Un POST/DELETE manual
 *    en esta UI competiria directamente con esa sincronizacion automatica
 *    y podria desalinear Llavero del sistema de origen.
 * 2. RF26 solo pide "consultar el directorio de comunidad, incluyendo
 *    datos de contacto (correo y telefono)". No pide administrarlo.
 *
 * Que el controller exponga POST/DELETE es asunto del backend (por ejemplo,
 * para un futuro endpoint de sync masivo del ETL, ver la nota de alcance en
 * back/comunidad/controller.py) -- no obliga a exponerlos en el frontend.
 * Por eso no hay comunidad.models.ts#PersonaInput, ni injectMutation, ni
 * invalidar() en este servicio: no hay nada que invalidar cuando no hay
 * mutaciones.
 */
@Injectable({ providedIn: 'root' })
export class ComunidadService {
  private readonly http = inject(HttpClient);

  readonly personas = injectQuery(() => ({
    queryKey: comunidadQueryKeys.lista,
    queryFn: () => firstValueFrom(this.http.get<Persona[]>(`${BASE_URL}/`)),
  }));
}
