import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { notificacionesQueryKeys } from './notificaciones-query-keys';
import type {
  EstadoEnvioNotificacion,
  Notificacion,
  NotificacionManualInput,
  RecordatorioInput,
  TipoNotificacion,
} from './notificaciones.models';

const BASE_URL = `${environment.apiBaseUrl}/notificaciones`;

/**
 * Servicio de datos de `Notificacion` (ver back/notificaciones/controller.py).
 *
 * Igual que en `reservas`/`prestamos`/`llaves`, acá NO hay `actualizar` ni
 * `eliminar`: el backend no expone PATCH ni DELETE. A diferencia de esas
 * tres, tampoco hay una transición de estado ("cerrar"/"cancelar"/
 * "desactivar") que el operador dispare sobre una fila existente:
 * `estado_envio` lo decide el backend según si el envío SMTP tuvo éxito (ver
 * `_intentar_envio` en back/notificaciones/service.py), nunca el cliente.
 * Cada mutación de este servicio CREA una fila nueva.
 *
 * Nota de diseño — sin endpoint de "reenviar" (confirmado: no existe en
 * back/notificaciones/controller.py, y el RF24 del proyecto pide "reenviar
 * notificaciones fallidas"): el backend no tiene forma de MUTAR una
 * notificación existente, así que "reenviar" una fallida se implementa acá
 * como un `enviarManual.mutate(...)` nuevo con los mismos datos
 * (destinatario, asunto, mensaje) que la notificación fallida — crea una fila
 * NUEVA, nunca toca la que falló. Ver `notificacion-form-dialog.component.ts`
 * (input `precarga`) y `notificaciones-list.component.ts` (acción
 * "Reenviar") para la implementación completa. Mismo estilo de documentar la
 * ausencia de un endpoint que `reservas.service.ts` usa para `completada`/
 * `no_reclamada`.
 *
 * Nota de diseño — `/recordatorio` SÍ se expone (`enviarRecordatorio`), pero
 * `/vencimiento` NO: `RecordatorioIn.mensaje` es opcional (`str | None =
 * None`) porque el backend arma un mensaje por defecto con la plantilla de
 * `configuracion.plantilla_recordatorio` si no se pasa uno (ver
 * back/notificaciones/service.py, `enviar_recordatorio`) — eso sí tiene
 * sentido como botón simple "Enviar recordatorio" en la UI: el operador
 * elige un destinatario y listo. `VencimientoIn.mensaje` en cambio es
 * REQUERIDO sin default ni plantilla ("mensaje siempre lo arma quien
 * invoca", ver el docstring de `enviar_vencimiento`): no hay ninguna
 * composición sensata que esta feature de administración pueda ofrecer sin
 * inventar un texto de negocio que el backend deliberadamente no provee, así
 * que se deja fuera de la UI — sigue siendo, como documenta ese módulo,
 * un primitivo pensado para un futuro orquestador/scheduler, no para el
 * operador humano.
 *
 * Nota de diseño — los filtros por tipo y por estado de envío viven acá y no
 * en el componente: `GET /api/notificaciones/tipo/{tipo}` y `GET
 * /api/notificaciones/estado-envio/{estado_envio}` son endpoints distintos de
 * `GET /api/notificaciones/`, así que filtrar por cualquiera de los dos es
 * una consulta al SERVIDOR — mismo patrón que `ReservasService.filtroEstado`/
 * `filtroSolicitante`. `filtroTipo`/`filtroEstadoEnvio` son las señales que
 * eligen cuál de los tres endpoints alimenta `notificaciones`.
 *
 * Nota de diseño — precedencia cuando ambos filtros están fijados a la vez:
 * el backend no expone un endpoint combinado tipo+estado-envío, así que
 * `notificaciones` solo puede alimentarse de UNO de los tres. Mismo criterio
 * que `ReservasService` (`filtroEstado` gana sobre `filtroSolicitante`):
 * `NotificacionesListComponent` impone exclusión mutua en la UI (elegir un
 * filtro limpia el otro), así que en la práctica los dos nunca están fijados
 * a la vez; `filtroEstadoEnvio` gana acá solo como cinturón de seguridad —
 * se elige `estadoEnvio` sobre `tipo` porque es el filtro que motiva el
 * flujo de "reenviar fallidas" (RF24), el caso de uso más frecuente de
 * filtrar esta lista.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['notificaciones']`, no
 * una clave puntual: enviar una notificación (manual o recordatorio)
 * desactualiza tanto la lista completa como la de su tipo y su estado de
 * envío, y las tres cuelgan de ese prefijo justamente para poder
 * refrescarlas con una sola invalidación (ver notificaciones-query-keys.ts).
 *
 * Nota de alcance — `GET /api/notificaciones/{id}` existe en el backend pero
 * esta feature no lo consume: `NotificacionOut` es la MISMA forma completa
 * que ya trae cada elemento de la lista, así que una consulta de detalle
 * sería un segundo viaje por datos que la fila ya tiene en mano — mismo
 * criterio que `ReservasService`.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  /** `null` = sin filtro (lista completa). */
  readonly filtroTipo = signal<TipoNotificacion | null>(null);
  /** `null` = sin filtro (lista completa). */
  readonly filtroEstadoEnvio = signal<EstadoEnvioNotificacion | null>(null);

  readonly notificaciones = injectQuery(() => {
    const estadoEnvio = this.filtroEstadoEnvio();
    const tipo = this.filtroTipo();
    const queryKey = estadoEnvio
      ? notificacionesQueryKeys.porEstadoEnvio(estadoEnvio)
      : tipo
        ? notificacionesQueryKeys.porTipo(tipo)
        : notificacionesQueryKeys.lista;
    const url = estadoEnvio
      ? `${BASE_URL}/estado-envio/${estadoEnvio}`
      : tipo
        ? `${BASE_URL}/tipo/${tipo}`
        : `${BASE_URL}/`;
    return {
      queryKey,
      queryFn: () => firstValueFrom(this.http.get<Notificacion[]>(url)),
    };
  });

  readonly enviarManual = injectMutation(() => ({
    mutationFn: (input: NotificacionManualInput) =>
      firstValueFrom(this.http.post<Notificacion>(`${BASE_URL}/manual`, input)),
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `POST /api/notificaciones/recordatorio`. `mensaje` se omite del cuerpo
   * cuando no se pasa (ver `RecordatorioInput`), en vez de mandar `undefined`
   * o `''`: así el backend aplica su propio default (la plantilla de
   * `configuracion`), que es justo el comportamiento que motiva exponer este
   * botón simple en la UI (ver docstring del servicio, más arriba).
   */
  readonly enviarRecordatorio = injectMutation(() => ({
    mutationFn: (input: RecordatorioInput) =>
      firstValueFrom(this.http.post<Notificacion>(`${BASE_URL}/recordatorio`, input)),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: notificacionesQueryKeys.raiz });
  }
}
