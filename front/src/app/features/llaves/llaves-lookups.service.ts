import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { llavesQueryKeys } from './llaves-query-keys';
import type {
  NovedadLookup,
  PersonaLookup,
  SalonLookup,
  UbicacionLookup,
  UsuarioLookup,
} from './llaves.models';

const API = environment.apiBaseUrl;

/**
 * Catálogos de apoyo que la feature `llaves` necesita para (a) resolver a
 * nombre legible las 7 FKs que `LlaveOut` devuelve como UUID crudo y (b)
 * poblar los `mat-select` de los diálogos de entrega y devolución.
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): lo prohibido es importar
 * el TypeScript de `features/catalogos`; llamar a `GET
 * /api/catalogos/salones` es consumir la API pública HTTP de otro módulo
 * del backend, exactamente lo mismo que hace cualquier cliente. Por eso
 * estas consultas viven acá, con sus propios tipos (`llaves.models.ts`) y
 * sus propias claves de caché (`llaves-query-keys.ts`), en vez de reusar
 * `CatalogosService`.
 *
 * Solo lectura: esta feature nunca crea ni edita salones, ubicaciones,
 * personas, usuarios ni novedades — no hay mutaciones acá, y por lo tanto
 * tampoco un `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class LlavesLookupsService {
  private readonly http = inject(HttpClient);

  readonly salones = injectQuery(() => ({
    queryKey: llavesQueryKeys.lookupSalones,
    queryFn: () => firstValueFrom(this.http.get<SalonLookup[]>(`${API}/catalogos/salones`)),
  }));

  readonly ubicaciones = injectQuery(() => ({
    queryKey: llavesQueryKeys.lookupUbicaciones,
    queryFn: () => firstValueFrom(this.http.get<UbicacionLookup[]>(`${API}/catalogos/ubicaciones`)),
  }));

  readonly personas = injectQuery(() => ({
    queryKey: llavesQueryKeys.lookupPersonas,
    queryFn: () => firstValueFrom(this.http.get<PersonaLookup[]>(`${API}/comunidad/`)),
  }));

  readonly usuarios = injectQuery(() => ({
    queryKey: llavesQueryKeys.lookupUsuarios,
    queryFn: () => firstValueFrom(this.http.get<UsuarioLookup[]>(`${API}/usuarios/`)),
  }));

  readonly novedades = injectQuery(() => ({
    queryKey: llavesQueryKeys.lookupNovedades,
    queryFn: () => firstValueFrom(this.http.get<NovedadLookup[]>(`${API}/novedades/`)),
  }));

  /**
   * Ubicaciones para el selector de ENTREGA, con las que permiten préstamo
   * de llaves primero. Es un criterio de ORDEN, no un filtro: una ubicación
   * sin permiso sigue siendo seleccionable y el backend responderá 400 con
   * su propio mensaje si no corresponde (ver llaves-error.util.ts). Filtrar
   * acá sería duplicar una regla de negocio del backend en el cliente, que
   * es justamente lo que este proyecto no hace.
   */
  readonly ubicacionesEntrega = computed(() =>
    ordenarPorPermiso(this.ubicaciones.data() ?? [], (u) => u.permite_prestamo_llaves),
  );

  /** Mismo criterio que `ubicacionesEntrega`, con el flag de devolución. */
  readonly ubicacionesDevolucion = computed(() =>
    ordenarPorPermiso(this.ubicaciones.data() ?? [], (u) => u.permite_devolucion_llaves),
  );

  // Opciones ya formateadas para los `mat-select` de los diálogos. Viven acá
  // (y no en cada diálogo) porque `usuarios` se usa tanto en la entrega
  // como en la devolución: una sola definición, una sola forma de
  // etiquetar.
  readonly opcionesPersonas = computed(() =>
    (this.personas.data() ?? []).map((persona) => ({
      // El documento desambigua homónimos, frecuentes en una comunidad
      // universitaria grande.
      label: `${persona.nombre} (${persona.numero_documento})`,
      value: persona.id,
    })),
  );

  readonly opcionesUsuarios = computed(() =>
    (this.usuarios.data() ?? []).map((usuario) => ({
      // Los usuarios desactivados se marcan pero NO se ocultan: si el
      // backend los rechaza, lo dirá con su propio 400.
      label: usuario.activo ? usuario.nombre : `${usuario.nombre} (inactivo)`,
      value: usuario.id,
    })),
  );

  readonly opcionesNovedades = computed(() =>
    (this.novedades.data() ?? []).map((novedad) => ({
      label: novedad.descripcion
        ? `${novedad.categoria} — ${novedad.descripcion}`
        : novedad.categoria,
      value: novedad.id,
    })),
  );

  // Los cuatro resolutores devuelven el id crudo como respaldo mientras el
  // lookup no haya cargado (o si el id no está en la lista): la tabla
  // siempre muestra algo, nunca una celda vacía ni un "undefined".
  nombreSalon(salonId: string): string {
    return this.salones.data()?.find((salon) => salon.id === salonId)?.nombre ?? salonId;
  }

  nombrePersona(personaId: string): string {
    return this.personas.data()?.find((persona) => persona.id === personaId)?.nombre ?? personaId;
  }

  nombreUsuario(usuarioId: string): string {
    return this.usuarios.data()?.find((usuario) => usuario.id === usuarioId)?.nombre ?? usuarioId;
  }

  nombreUbicacion(ubicacionId: string): string {
    return (
      this.ubicaciones.data()?.find((ubicacion) => ubicacion.id === ubicacionId)?.nombre ??
      ubicacionId
    );
  }
}

function ordenarPorPermiso(
  ubicaciones: UbicacionLookup[],
  permite: (ubicacion: UbicacionLookup) => boolean,
): UbicacionLookup[] {
  return [...ubicaciones].sort((a, b) => Number(permite(b)) - Number(permite(a)));
}
