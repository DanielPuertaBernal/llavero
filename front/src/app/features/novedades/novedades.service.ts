import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { novedadesQueryKeys } from './novedades-query-keys';
import type {
  CategoriaNovedad,
  CerrarNovedadVariables,
  EstadoNovedad,
  Novedad,
  NovedadInput,
} from './novedades.models';

const BASE_URL = `${environment.apiBaseUrl}/novedades`;

/**
 * Servicio de datos de `Novedad` (ver back/novedades/controller.py).
 *
 * Igual que en `usuarios` y `monitores`, acá hay `crear` pero NI
 * `actualizar` NI `eliminar`: el backend no expone PATCH ni DELETE sobre
 * novedades. A diferencia de `usuarios` (que sí tiene `reactivar`), acá
 * TAMPOCO hay una transición de vuelta: `cerrar` es la ÚNICA transición de
 * `estado`, y no tiene endpoint de reapertura (confirmado leyendo
 * back/novedades/controller.py completo — no existe `POST /{id}/reabrir`).
 * Una novedad cerrada lo queda para siempre por esta API; el diálogo de
 * cierre lo advierte como una acción sin vuelta atrás (ver
 * `NovedadCierreDialogComponent`, mismo criterio que
 * `MonitorDesactivacionDialogComponent`).
 *
 * Nota de diseño — precedencia entre `filtroEstado` y `filtroCategoria`,
 * el punto central de este servicio. El backend expone TRES fuentes para la
 * lista (`GET /`, `GET /estado/{estado}`, `GET /categoria/{categoria}`) pero
 * ningún endpoint combinado estado+categoría, así que `novedades` solo puede
 * alimentarse de UNA de las tres a la vez — mismo problema estructural que
 * `ReservasService.filtroSolicitante`/`filtroEstado`. Se aplica el MISMO
 * criterio en dos capas:
 *
 * 1. `NovedadesListComponent` impone exclusión mutua en la UI: elegir un
 *    estado limpia `filtroCategoria` y viceversa (ver su docblock), así que
 *    en la práctica los dos nunca están fijados a la vez.
 * 2. Acá, `filtroEstado` gana en el `injectQuery` de abajo si de todos modos
 *    ambos llegaran fijados — un cinturón de seguridad ante ese caso que la
 *    UI ya evita, igual que en `reservas.service.ts`. Se elige `estado` (y
 *    no `categoria`) por el mismo motivo que `reservas` eligió su ganador:
 *    es el filtro operativo por el que un supervisor típicamente quiere
 *    triar la bandeja ("¿qué sigue abierto?"), mientras que categoría es más
 *    bien un criterio de clasificación secundario.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['novedades']`, no una
 * clave puntual: crear o cerrar una novedad desactualiza tanto la lista
 * completa como la de su estado y la de su categoría, y las tres cuelgan de
 * ese prefijo justamente para poder refrescarlas con una sola invalidación
 * (ver novedades-query-keys.ts).
 */
@Injectable({ providedIn: 'root' })
export class NovedadesService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  /** `null` = sin filtro (lista completa). */
  readonly filtroEstado = signal<EstadoNovedad | null>(null);
  /** `null` = sin filtro (lista completa). */
  readonly filtroCategoria = signal<CategoriaNovedad | null>(null);

  readonly novedades = injectQuery(() => {
    const estado = this.filtroEstado();
    const categoria = this.filtroCategoria();
    const queryKey = estado
      ? novedadesQueryKeys.porEstado(estado)
      : categoria
        ? novedadesQueryKeys.porCategoria(categoria)
        : novedadesQueryKeys.lista;
    const url = estado
      ? `${BASE_URL}/estado/${estado}`
      : categoria
        ? `${BASE_URL}/categoria/${categoria}`
        : `${BASE_URL}/`;
    return {
      queryKey,
      queryFn: () => firstValueFrom(this.http.get<Novedad[]>(url)),
    };
  });

  readonly crear = injectMutation(() => ({
    mutationFn: (input: NovedadInput) =>
      firstValueFrom(this.http.post<Novedad>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `POST /api/novedades/{id}/cerrar`. El `id` identifica a la novedad
   * objetivo y viaja en la URL, así que se desestructura FUERA del cuerpo: lo
   * que se manda es solo `solucion` (`CerrarNovedadIn`).
   */
  readonly cerrar = injectMutation(() => ({
    mutationFn: ({ id, solucion }: CerrarNovedadVariables) =>
      firstValueFrom(this.http.post<Novedad>(`${BASE_URL}/${id}/cerrar`, { solucion })),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: novedadesQueryKeys.raiz });
  }
}
