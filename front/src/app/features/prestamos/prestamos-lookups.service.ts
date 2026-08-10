import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { prestamosQueryKeys } from './prestamos-query-keys';
import type {
  EquipoLookup,
  NovedadLookup,
  PersonaLookup,
  UbicacionLookup,
  UsuarioLookup,
} from './prestamos.models';

const API = environment.apiBaseUrl;

/**
 * Catálogos de apoyo que la feature `prestamos` necesita para (a) resolver a
 * nombre legible las FKs que `PrestamoOut`/`DetallePrestamoOut`/
 * `DevolucionOut` devuelven como UUID crudo y (b) poblar los selectores de
 * los diálogos de registro y devolución.
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): lo prohibido es importar el
 * TypeScript de `features/catalogos`; llamar a
 * `GET /api/catalogos/ubicaciones` es consumir la API pública HTTP de otro
 * módulo del backend, exactamente lo mismo que hace cualquier cliente. Por
 * eso estas consultas viven acá, con sus propios tipos
 * (`prestamos.models.ts`) y sus propias claves de caché
 * (`prestamos-query-keys.ts`), en vez de reusar servicios de otras features.
 *
 * Solo lectura: esta feature nunca crea ni edita personas, usuarios,
 * ubicaciones, equipos ni novedades — no hay mutaciones acá, y por lo tanto
 * tampoco un `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class PrestamosLookupsService {
  private readonly http = inject(HttpClient);

  readonly personas = injectQuery(() => ({
    queryKey: prestamosQueryKeys.lookupPersonas,
    queryFn: () => firstValueFrom(this.http.get<PersonaLookup[]>(`${API}/comunidad/`)),
  }));

  readonly usuarios = injectQuery(() => ({
    queryKey: prestamosQueryKeys.lookupUsuarios,
    queryFn: () => firstValueFrom(this.http.get<UsuarioLookup[]>(`${API}/usuarios/`)),
  }));

  readonly ubicaciones = injectQuery(() => ({
    queryKey: prestamosQueryKeys.lookupUbicaciones,
    queryFn: () => firstValueFrom(this.http.get<UbicacionLookup[]>(`${API}/catalogos/ubicaciones`)),
  }));

  readonly equipos = injectQuery(() => ({
    queryKey: prestamosQueryKeys.lookupEquipos,
    queryFn: () => firstValueFrom(this.http.get<EquipoLookup[]>(`${API}/equipos/`)),
  }));

  readonly novedades = injectQuery(() => ({
    queryKey: prestamosQueryKeys.lookupNovedades,
    queryFn: () => firstValueFrom(this.http.get<NovedadLookup[]>(`${API}/novedades/`)),
  }));

  /**
   * Ubicaciones para el selector de REGISTRO del préstamo, con las que
   * permiten préstamo de equipos primero. Es un criterio de ORDEN, no un
   * filtro: una ubicación sin permiso sigue siendo seleccionable y el
   * backend responderá 400 con su propio mensaje si no corresponde (ver
   * prestamos-error.util.ts). Filtrar acá sería duplicar una regla de
   * negocio del backend en el cliente, que es justamente lo que este
   * proyecto no hace.
   */
  readonly ubicacionesPrestamo = computed(() =>
    [...(this.ubicaciones.data() ?? [])].sort(
      (a, b) => Number(b.permite_prestamo_equipos) - Number(a.permite_prestamo_equipos),
    ),
  );

  /**
   * Ubicaciones para el selector de DEVOLUCIÓN, sin reordenar. A diferencia
   * de llaves, `Ubicacion` NO tiene un flag `permite_devolucion_equipos`
   * (ver back/catalogos/model.py) y `service.devolver_equipos` tampoco
   * valida permiso alguno de ubicación al recibir equipos: no hay criterio
   * por el cual priorizar unas sobre otras, así que se ofrecen tal como las
   * devuelve el backend. Inventar acá un permiso que el dominio no tiene
   * sería peor que no ordenar.
   */
  readonly ubicacionesDevolucion = computed(() => this.ubicaciones.data() ?? []);

  // Opciones ya formateadas para los selectores de los diálogos. Viven acá
  // (y no en cada diálogo) porque `usuarios` y `equipos` se usan tanto en el
  // registro como en la devolución: una sola definición, una sola forma de
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

  /**
   * Opciones del multiselect de equipos. La etiqueta combina nombre y código
   * de inventario porque dos equipos del mismo modelo comparten nombre y el
   * código es lo que el operador tiene a la vista en la etiqueta física.
   *
   * Los equipos `inactivo` se MARCAN, no se excluyen — y los ya prestados en
   * otro préstamo activo tampoco se pueden excluir: no existe endpoint que
   * informe la disponibilidad real, así que cualquier filtro cliente sería
   * una adivinanza. El rechazo lo hace el backend con su 400.
   */
  readonly opcionesEquipos = computed(() =>
    (this.equipos.data() ?? []).map((equipo) => ({
      label:
        equipo.estado === 'activo'
          ? `${equipo.nombre} (${equipo.codigo_inventario})`
          : `${equipo.nombre} (${equipo.codigo_inventario}) — inactivo`,
      value: equipo.id,
    })),
  );

  readonly opcionesNovedades = computed(() =>
    (this.novedades.data() ?? []).map((novedad) => ({
      label: etiquetaNovedad(novedad),
      value: novedad.id,
    })),
  );

  // Los resolutores devuelven el id crudo como respaldo mientras el lookup
  // no haya cargado (o si el id no está en la lista): la tabla siempre
  // muestra algo, nunca una celda vacía ni un "undefined".
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

  /** Mismo formato que `opcionesEquipos` para que la tabla y el selector
   * nombren el equipo igual. */
  nombreEquipo(equipoId: string): string {
    const equipo = this.equipos.data()?.find((candidato) => candidato.id === equipoId);
    return equipo ? `${equipo.nombre} (${equipo.codigo_inventario})` : equipoId;
  }

  nombreNovedad(novedadId: string): string {
    const novedad = this.novedades.data()?.find((candidata) => candidata.id === novedadId);
    return novedad ? etiquetaNovedad(novedad) : novedadId;
  }
}

function etiquetaNovedad(novedad: NovedadLookup): string {
  return novedad.descripcion ? `${novedad.categoria} — ${novedad.descripcion}` : novedad.categoria;
}
