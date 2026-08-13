import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectMutation, injectQuery, injectQueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { reservasSemestralesQueryKeys } from './reservas-semestrales-query-keys';
import type { GrupoReservaSemestralInput, ReservaSemestral } from './reservas-semestrales.models';

const BASE_URL = `${environment.apiBaseUrl}/reservas-semestrales`;

/**
 * Servicio de datos de `ReservaSemestral` (ver
 * back/reservas_semestrales/controller.py).
 *
 * Nota de alcance — NO hay `filtroSolicitante` acá, a diferencia de
 * `ReservasService` (feature hermana): el controller de
 * `reservas_semestrales` no expone `GET /solicitante/{id}` por HTTP —
 * `service.listar_por_solicitante` existe en el backend, pero documentado
 * explícitamente para consumo interno del módulo `nfc`, no como endpoint de
 * este router (verificado leyendo back/reservas_semestrales/controller.py
 * completo: los únicos `GET` son `/`, `/{reserva_id}` y `/grupo/{grupo_id}`).
 * No se simula acá un filtro que el backend no ofrece.
 *
 * Nota de diseño — `crear` envía TODAS las franjas del grupo en un solo
 * `POST` (`GrupoReservaSemestralInput.franjas`), no una franja a la vez: el
 * backend genera un único `grupo_id` para el lote completo (ver
 * back/reservas_semestrales/model.py), así que dividir la creación en varias
 * peticiones produciría varios grupos sueltos en vez de uno solo agrupado.
 *
 * Nota de diseño — `cancelar` recibe `grupoId`, no el id de una franja
 * individual: `POST /grupo/{grupo_id}/cancelar` elimina TODAS las franjas de
 * ese grupo a la vez (no hay `POST /{id}/cancelar` por franja en este
 * controller — a diferencia de `ReservasService.cancelar`, que sí cancela una
 * reserva individual por su propio id). "Cancelar una franja suelta" no es
 * una operación que el backend ofrezca: el grupo se cancela completo.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['reservas-
 * semestrales']`, no una clave puntual: crear o cancelar un grupo
 * desactualiza tanto la lista completa como la consulta por grupo (si algún
 * componente la tiene activa), y ambas cuelgan de ese prefijo justamente para
 * poder refrescarlas con una sola invalidación (ver
 * reservas-semestrales-query-keys.ts).
 */
@Injectable({ providedIn: 'root' })
export class ReservasSemestralesService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly reservas = injectQuery(() => ({
    queryKey: reservasSemestralesQueryKeys.lista,
    queryFn: () => firstValueFrom(this.http.get<ReservaSemestral[]>(`${BASE_URL}/`)),
  }));

  /**
   * `POST /api/reservas-semestrales/`. La respuesta es
   * `list[ReservaSemestralOut]` (todas las franjas creadas del grupo, cada
   * una ya con el `grupo_id` que el backend generó), no una sola franja.
   */
  readonly crear = injectMutation(() => ({
    mutationFn: (input: GrupoReservaSemestralInput) =>
      firstValueFrom(this.http.post<ReservaSemestral[]>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `POST /api/reservas-semestrales/grupo/{grupo_id}/cancelar`. El endpoint
   * no declara schema de entrada, así que se envía `null` como cuerpo en vez
   * de inventar un objeto con campos que el backend ignoraría (mismo criterio
   * que `ReservasService.cancelar`). La respuesta es `{eliminadas: N}`, pero
   * la vista toma el resultado de la invalidación, no de este cuerpo.
   */
  readonly cancelar = injectMutation(() => ({
    mutationFn: (variables: { grupoId: string }) =>
      firstValueFrom(
        this.http.post<{ eliminadas: number }>(`${BASE_URL}/grupo/${variables.grupoId}/cancelar`, null),
      ),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: reservasSemestralesQueryKeys.raiz });
  }
}
