import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { monitoresQueryKeys } from './monitores-query-keys';
import type { Monitor, MonitorInput } from './monitores.models';

const BASE_URL = `${environment.apiBaseUrl}/monitores`;

/**
 * Servicio de datos de `Monitor` (ver back/monitores/controller.py).
 *
 * Estructuralmente es más parecido a `UsuariosService` que a
 * `ReservasService`: hay `crear` y `desactivar`, pero NI `actualizar` NI
 * `eliminar` — el backend no expone PATCH ni DELETE sobre monitores.
 *
 * A diferencia de `UsuariosService`, acá tampoco hay `reactivar`:
 * `POST /{id}/desactivar` es la ÚNICA transición de `activo`, y no tiene
 * endpoint de vuelta (confirmado leyendo back/monitores/controller.py
 * completo — no existe `POST /{id}/reactivar`). Una monitoría desactivada lo
 * queda para siempre por esta API; el diálogo de desactivación lo advierte
 * como una acción sin vuelta atrás (ver `MonitorDesactivacionDialogComponent`).
 *
 * Nota de diseño — igual que en `usuarios`, acá NO hay una señal
 * `filtroEstado`: el backend no tiene `GET /estado/{estado}` para monitores,
 * así que filtrar por activo/inactivo es un `filter()` sobre la lista ya
 * descargada y vive en el componente.
 *
 * Nota de alcance — `GET /monitor-delegado/{id}/monitorias` existe en el
 * backend pero no se expone acá: es el endpoint que el futuro `llaves`
 * consumirá para resolver delegación de acceso (ver el docstring de
 * back/monitores/service.py), no una consulta de esta UI de administración,
 * que ya lista y puede filtrar por monitor delegado en memoria sobre
 * `GET /`. `GET /{id}/clases-docente-titular` SÍ se consume, pero no acá: es
 * una consulta por monitoría (no una lista ni una mutación), y vive en
 * `MonitorClasesDocenteComponent`, la fila expandida de la tabla — mismo
 * criterio que `PrestamoDetallesService` para el detalle de un préstamo.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['monitores']` y no la
 * clave puntual de la lista: mismo criterio que las otras features.
 */
@Injectable({ providedIn: 'root' })
export class MonitoresService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly monitores = injectQuery(() => ({
    queryKey: monitoresQueryKeys.lista,
    queryFn: () => firstValueFrom(this.http.get<Monitor[]>(`${BASE_URL}/`)),
  }));

  readonly crear = injectMutation(() => ({
    mutationFn: (input: MonitorInput) =>
      firstValueFrom(this.http.post<Monitor>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `POST /api/monitores/{id}/desactivar`. El endpoint no declara schema de
   * entrada (ver back/monitores/controller.py: `desactivar_monitor` solo
   * recibe `monitor_id` en la URL), así que se envía `null` como cuerpo — el
   * mismo criterio que `ReservasService.cancelar` — en vez de inventar un
   * objeto con campos que el backend ignoraría.
   */
  readonly desactivar = injectMutation(() => ({
    mutationFn: (id: string) =>
      firstValueFrom(this.http.post<Monitor>(`${BASE_URL}/${id}/desactivar`, null)),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: monitoresQueryKeys.raiz });
  }
}
