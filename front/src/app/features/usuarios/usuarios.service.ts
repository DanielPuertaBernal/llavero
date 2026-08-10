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
import type { DesactivacionVariables, Usuario, UsuarioInput } from './usuarios.models';

const BASE_URL = `${environment.apiBaseUrl}/usuarios`;

/**
 * Servicio de datos de `Usuario` (ver back/usuarios/controller.py).
 *
 * A diferencia de los servicios de `catalogos`, acá NO hay `actualizar` ni
 * `eliminar`: el backend no expone PATCH ni DELETE sobre usuarios. Un
 * usuario se crea (`POST /api/usuarios/`) y, como mucho, se desactiva
 * (`POST /api/usuarios/{id}/desactivar`) — que es una transición de estado
 * de una sola dirección, no una edición de campos. Tampoco hay un
 * `reactivar`: ese endpoint sencillamente no existe, así que la feature no
 * puede ofrecerlo (y el diálogo de confirmación se lo advierte al operador
 * ANTES de aceptar, ver `UsuariosListComponent`).
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
