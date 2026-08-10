import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { usuariosQueryKeys } from './usuarios-query-keys';
import type {
  DesactivacionVariables,
  Usuario,
  UsuarioInput,
  UsuarioPatchInput,
} from './usuarios.models';

const BASE_URL = `${environment.apiBaseUrl}/usuarios`;

/**
 * Servicio de datos de `Usuario` (ver back/usuarios/controller.py).
 *
 * A diferencia de los servicios de `catalogos`, acá hay `actualizar` pero
 * NO hay `eliminar`: el backend no expone DELETE sobre usuarios. Un usuario
 * no se borra nunca — darlo de baja es desactivarlo, y así su historial de
 * préstamos sigue siendo referenciable.
 *
 * Los datos y el ESTADO se cambian por caminos distintos, y esa separación
 * es del backend, no una convención de esta capa:
 *
 * - `actualizar` (`PATCH /api/usuarios/{id}`) toca los 4 campos de datos
 *   (`nombre`, `email_institucional`, `rol_id`, `ubicacion_id`) con un
 *   cuerpo parcial: el backend aplica solo los que llegan.
 * - `desactivar` y `reactivar` (`POST /{id}/desactivar` y
 *   `POST /{id}/reactivar`) son las ÚNICAS transiciones de `activo`.
 *
 * Por eso `actualizar` recibe `UsuarioPatchInput` y no
 * `Partial<UsuarioInput>`: el segundo incluiría `activo`, que el schema
 * `UsuarioPatch` del backend no declara — se ignoraría en silencio y, peor,
 * permitiría saltarse la autoprotección que sí aplica `desactivar` (nadie
 * puede desactivarse a sí mismo). El tipo hace que ese payload ni siquiera
 * se pueda escribir.
 *
 * Nota de alcance — `POST /api/usuarios/vincular-oid-microsoft` existe en
 * el backend pero NO se expone acá: es un paso interno del login federado
 * de Office 365 (vincula el `oid` de Microsoft a un usuario precreado en
 * su primer ingreso), no una acción de administración. Modelarlo como
 * mutación de esta feature invitaría a dispararlo desde la UI, que es
 * justo lo que no debe pasar.
 *
 * Nota de diseño — a diferencia de `llaves` y `prestamos`, acá NO hay una
 * señal `filtroEstado` en el servicio: el backend no tiene un
 * `GET /estado/{estado}` para usuarios, así que filtrar por activo/inactivo
 * es un `filter()` sobre la lista ya descargada y vive en el componente.
 * Poner esa señal acá sugeriría una consulta al servidor que no ocurre.
 *
 * Nota de diseño — `invalidar()` invalida el prefijo `['usuarios']` y no la
 * clave puntual de la lista: es el mismo criterio de las otras features, y
 * deja la puerta abierta a que se agreguen más consultas bajo ese prefijo
 * sin tener que tocar cada `onSuccess`.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly usuarios = injectQuery(() => ({
    queryKey: usuariosQueryKeys.lista,
    queryFn: () => firstValueFrom(this.http.get<Usuario[]>(`${BASE_URL}/`)),
  }));

  readonly crear = injectMutation(() => ({
    mutationFn: (input: UsuarioInput) =>
      firstValueFrom(this.http.post<Usuario>(`${BASE_URL}/`, input)),
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `PATCH /api/usuarios/{id}`. El `id` identifica al objetivo y viaja en la
   * URL, así que se desestructura FUERA del cuerpo: lo que se manda son solo
   * los campos que cambian (ver `UsuarioPatchInput`, que deliberadamente no
   * declara `activo`).
   *
   * Nota de errores — el backend NO valida en Python la unicidad de
   * `email_institucional`: deja propagar el error de Postgres, que sale como
   * 500 sin un `{detail}` legible. `extraerMensajeError` cae entonces a su
   * mensaje por defecto, y por eso el diálogo de edición usa uno que nombra
   * el correo duplicado como causa probable. NO se agrega un pre-chequeo de
   * unicidad del lado cliente: la base de datos sigue siendo la autoridad.
   */
  readonly actualizar = injectMutation(() => ({
    mutationFn: (variables: { id: string } & UsuarioPatchInput) => {
      const { id, ...cambios } = variables;
      return firstValueFrom(this.http.patch<Usuario>(`${BASE_URL}/${id}`, cambios));
    },
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `POST /api/usuarios/{id}/reactivar`. El endpoint NO recibe cuerpo (a
   * diferencia de `desactivar`, que exige `usuario_actual_id`): no hay regla
   * de autoprotección que aplicar al devolverle el acceso a alguien. El `{}`
   * existe únicamente porque `HttpClient.post` exige el argumento `body`.
   *
   * Es idempotente: reactivar a un usuario ya activo devuelve 200 con el
   * mismo `UsuarioOut`, así que un doble clic no es un caso de error.
   */
  readonly reactivar = injectMutation(() => ({
    mutationFn: (id: string) =>
      firstValueFrom(this.http.post<Usuario>(`${BASE_URL}/${id}/reactivar`, {})),
    onSuccess: () => this.invalidar(),
  }));

  /**
   * `usuario_actual_id` (quién ejecuta la acción) es parte del CUERPO, no
   * de la sesión: el backend todavía lo recibe explícito (ver la nota del
   * módulo en back/usuarios/controller.py). Quien llama debe tomarlo de
   * `AuthService.currentUser()`; este servicio no lo resuelve solo para
   * que la ausencia de sesión sea un caso que el componente maneje de
   * forma visible, y no un `undefined` colándose en el request.
   */
  readonly desactivar = injectMutation(() => ({
    mutationFn: ({ id, usuario_actual_id }: DesactivacionVariables) =>
      firstValueFrom(
        this.http.post<Usuario>(`${BASE_URL}/${id}/desactivar`, { usuario_actual_id }),
      ),
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: usuariosQueryKeys.raiz });
  }
}
