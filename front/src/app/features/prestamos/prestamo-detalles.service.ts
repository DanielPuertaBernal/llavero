import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { prestamosQueryKeys } from './prestamos-query-keys';
import type { DetallePrestamo, Devolucion } from './prestamos.models';

const BASE_URL = `${environment.apiBaseUrl}/prestamos`;

/**
 * Detalle de UN préstamo: sus equipos (`GET /api/prestamos/{id}/detalles`) y
 * sus devoluciones (`GET /api/prestamos/{id}/devoluciones`).
 *
 * Nota de arquitectura — este servicio NO es `providedIn: 'root'`, a
 * diferencia de `PrestamosService` y `PrestamosLookupsService`. Se provee a
 * nivel de componente (`providers: [PrestamoDetallesService]`) tanto en la
 * fila expandida como en el diálogo de devolución, y la razón es concreta:
 * el servicio se identifica con UN préstamo a la vez a través de la señal
 * `prestamoId`. Un singleton de raíz con una sola señal no puede servir a
 * varias filas expandidas simultáneamente — la última en escribir ganaría y
 * todas las demás mostrarían los equipos del préstamo equivocado. Con una
 * instancia por componente, cada fila expandida tiene su propio `prestamoId`
 * y sus propias dos consultas.
 *
 * Eso no duplica tráfico: las claves de caché (`detalles(id)` /
 * `devoluciones(id)`) son globales al `QueryClient`, así que dos instancias
 * apuntando al mismo préstamo comparten la misma entrada de caché y una sola
 * petición.
 *
 * Nota de diseño — ambas consultas quedan DESHABILITADAS mientras
 * `prestamoId` sea `null`: el componente escribe la señal desde su `input`,
 * y hasta entonces no hay URL válida que pedir (`/prestamos//detalles` sería
 * un 404 seguro).
 */
@Injectable()
export class PrestamoDetallesService {
  private readonly http = inject(HttpClient);

  /** `null` = todavía no se sabe de qué préstamo se está hablando. */
  readonly prestamoId = signal<string | null>(null);

  readonly detalles = injectQuery(() => {
    const id = this.prestamoId();
    return {
      queryKey: prestamosQueryKeys.detalles(id ?? ''),
      queryFn: () => firstValueFrom(this.http.get<DetallePrestamo[]>(`${BASE_URL}/${id}/detalles`)),
      enabled: id !== null,
    };
  });

  readonly devoluciones = injectQuery(() => {
    const id = this.prestamoId();
    return {
      queryKey: prestamosQueryKeys.devoluciones(id ?? ''),
      queryFn: () => firstValueFrom(this.http.get<Devolucion[]>(`${BASE_URL}/${id}/devoluciones`)),
      enabled: id !== null,
    };
  });

  /**
   * Ids de los equipos que todavía están `entregado`, es decir, los únicos
   * que `POST /{id}/devolver` acepta (el backend rechaza con 400 un equipo
   * ya devuelto). El diálogo de devolución arma su multiselect con esto: no
   * es replicar una regla de negocio, es no ofrecer una opción que el propio
   * préstamo ya declaró cerrada.
   */
  readonly equiposEntregados = computed(() =>
    (this.detalles.data() ?? [])
      .filter((detalle) => detalle.estado_equipo === 'entregado')
      .map((detalle) => detalle.equipo_id),
  );
}
