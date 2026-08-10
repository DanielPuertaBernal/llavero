import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { usuariosQueryKeys } from './usuarios-query-keys';
import type { RolLookup, UbicacionLookup } from './usuarios.models';

const API = environment.apiBaseUrl;

/**
 * Catálogos de apoyo que la feature `usuarios` necesita para (a) resolver a
 * nombre legible las 2 FKs que `UsuarioOut` devuelve como UUID crudo
 * (`rol_id`, `ubicacion_id`) y (b) poblar los `p-select` del formulario de
 * creación.
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): lo prohibido es importar
 * el TypeScript de `features/catalogos`; llamar a
 * `GET /api/catalogos/roles` es consumir la API pública HTTP de otro módulo
 * del backend, exactamente lo mismo que hace cualquier cliente. Por eso
 * estas consultas viven acá, con sus propios tipos (`usuarios.models.ts`) y
 * sus propias claves de caché (`usuarios-query-keys.ts`), en vez de reusar
 * los servicios de `catalogos`.
 *
 * Solo lectura: esta feature nunca crea ni edita roles ni ubicaciones — no
 * hay mutaciones acá, y por lo tanto tampoco un `invalidar()`. Administrar
 * esos catálogos es asunto de `features/catalogos`, no de esta vista.
 *
 * Nota de alcance — roles NO tiene una vista de administración propia en el
 * frontend (ver front/README.md, "Roles y TipoPersona quedan fuera de
 * alcance a propósito"), pero sí se leen acá: sin ellos la columna "Rol" de
 * la tabla mostraría UUID crudos y el formulario no podría pedir uno.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosLookupsService {
  private readonly http = inject(HttpClient);

  readonly roles = injectQuery(() => ({
    queryKey: usuariosQueryKeys.lookupRoles,
    queryFn: () => firstValueFrom(this.http.get<RolLookup[]>(`${API}/catalogos/roles`)),
  }));

  readonly ubicaciones = injectQuery(() => ({
    queryKey: usuariosQueryKeys.lookupUbicaciones,
    queryFn: () => firstValueFrom(this.http.get<UbicacionLookup[]>(`${API}/catalogos/ubicaciones`)),
  }));

  // Opciones ya formateadas para los `p-select` del formulario. Viven acá
  // (y no en el diálogo) por la misma razón que en las otras features: una
  // sola definición y una sola forma de etiquetar.
  //
  // Ninguna de las dos listas se filtra ni se ordena por criterios de
  // negocio: el backend valida en `crear_usuario` que el rol y la ubicación
  // existan, y no hay ningún flag de `Ubicacion` que condicione a qué
  // ubicación puede pertenecer un usuario (los `permite_*` gobiernan
  // préstamos y devoluciones, no la asignación de personal).
  readonly opcionesRoles = computed(() =>
    (this.roles.data() ?? []).map((rol) => ({ label: rol.nombre, value: rol.id })),
  );

  readonly opcionesUbicaciones = computed(() =>
    (this.ubicaciones.data() ?? []).map((ubicacion) => ({
      label: ubicacion.nombre,
      value: ubicacion.id,
    })),
  );

  // Los dos resolutores devuelven el id crudo como respaldo mientras el
  // lookup no haya cargado (o si el id no está en la lista): la tabla
  // siempre muestra algo, nunca una celda vacía ni un "undefined".
  nombreRol(rolId: string): string {
    return this.roles.data()?.find((rol) => rol.id === rolId)?.nombre ?? rolId;
  }

  nombreUbicacion(ubicacionId: string): string {
    return (
      this.ubicaciones.data()?.find((ubicacion) => ubicacion.id === ubicacionId)?.nombre ??
      ubicacionId
    );
  }
}
