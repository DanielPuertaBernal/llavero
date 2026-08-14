import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { historialQueryKeys } from './historial-query-keys';
import type { EquipoLookup, PersonaLookup, SalonLookup, UsuarioLookup } from './historial.models';

const API = environment.apiBaseUrl;

/**
 * Los cuatro catálogos de apoyo que `historial-list.component.ts` necesita
 * para resolver a nombre legible las FKs crudas de `EventoHistorial`
 * (ver historial.models.ts):
 *
 * - `GET /api/usuarios/` (`UsuarioOut`, back/usuarios/controller.py):
 *   `procesado_por_id`.
 * - `GET /api/comunidad/` (`ComunidadOut`, back/comunidad/controller.py):
 *   `docente_titular_id`, `reclamado_por_id`, `solicitante_id`.
 * - `GET /api/catalogos/salones` (`SalonOut`, back/catalogos/controller.py):
 *   `salon_id`.
 * - `GET /api/equipos/` (`EquipoOut`, back/equipos/controller.py):
 *   cada id de `equipo_ids`.
 *
 * Nota de arquitectura -- igual que en `reservas-lookups.service.ts` y
 * `comunidad-lookups.service.ts`: consumir el endpoint HTTP público de otro
 * módulo del backend no es importar el TypeScript de otra feature (regla
 * dura, ver front/README.md) -- por eso esta feature tiene sus propios tipos
 * (historial.models.ts) y sus propias claves de caché
 * (historial-query-keys.ts) para los cuatro lookups, en vez de reusar
 * servicios de `usuarios`/`comunidad`/`catalogos`/`equipos`.
 *
 * Solo lectura: esta feature nunca crea ni edita usuarios, personas, salones
 * ni equipos -- no hay mutaciones acá, y por lo tanto tampoco un
 * `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class HistorialLookupsService {
  private readonly http = inject(HttpClient);

  readonly usuarios = injectQuery(() => ({
    queryKey: historialQueryKeys.lookupUsuarios,
    queryFn: () => firstValueFrom(this.http.get<UsuarioLookup[]>(`${API}/usuarios/`)),
  }));

  readonly personas = injectQuery(() => ({
    queryKey: historialQueryKeys.lookupPersonas,
    queryFn: () => firstValueFrom(this.http.get<PersonaLookup[]>(`${API}/comunidad/`)),
  }));

  readonly salones = injectQuery(() => ({
    queryKey: historialQueryKeys.lookupSalones,
    queryFn: () => firstValueFrom(this.http.get<SalonLookup[]>(`${API}/catalogos/salones`)),
  }));

  readonly equipos = injectQuery(() => ({
    queryKey: historialQueryKeys.lookupEquipos,
    queryFn: () => firstValueFrom(this.http.get<EquipoLookup[]>(`${API}/equipos/`)),
  }));

  readonly listaUsuarios = computed(() => this.usuarios.data() ?? []);
  readonly listaPersonas = computed(() => this.personas.data() ?? []);
  readonly listaSalones = computed(() => this.salones.data() ?? []);
  readonly listaEquipos = computed(() => this.equipos.data() ?? []);

  // Los resolutores devuelven el id crudo como respaldo mientras el lookup no
  // haya cargado (o si el id no está en la lista): la tabla siempre muestra
  // algo, nunca una celda vacía ni un "undefined" -- mismo criterio que
  // `ReservasLookupsService.nombrePersona`/`nombreSalon`.
  nombreUsuario(usuarioId: string): string {
    return this.usuarios.data()?.find((usuario) => usuario.id === usuarioId)?.nombre ?? usuarioId;
  }

  nombrePersona(personaId: string): string {
    return this.personas.data()?.find((persona) => persona.id === personaId)?.nombre ?? personaId;
  }

  nombreSalon(salonId: string): string {
    return this.salones.data()?.find((salon) => salon.id === salonId)?.nombre ?? salonId;
  }

  /**
   * Resuelve una lista de `equipo_ids` a sus nombres, unidos por coma, para
   * la columna "detalle" de un evento de equipo (ver
   * historial-list.component.ts). Devuelve `null` cuando `equipoIds` es
   * `null` (evento de devolución, donde el backend no puede reconstruir qué
   * equipos puntuales se devolvieron -- ver historial.models.ts), para que
   * el componente decida cómo mostrarlo (un guion largo, no una cadena
   * vacía).
   */
  nombresEquipos(equipoIds: string[] | null): string | null {
    if (equipoIds === null) {
      return null;
    }
    return equipoIds.map((equipoId) => this.nombreEquipo(equipoId)).join(', ');
  }

  private nombreEquipo(equipoId: string): string {
    return this.equipos.data()?.find((equipo) => equipo.id === equipoId)?.nombre ?? equipoId;
  }
}
