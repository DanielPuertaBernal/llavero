import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { injectMutation, injectQuery, injectQueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { programacionQueryKeys } from './programacion-query-keys';
import type { ImportarProgramacionOut, ProgramacionResumen, Semestre } from './programacion.models';

const BASE_URL = `${environment.apiBaseUrl}/programacion`;

/**
 * Servicio de datos de la feature `programacion` (ver
 * back/programacion/controller.py). Cubre únicamente lo que el backend
 * expone hoy: listar semestres ya cargados y la carga masiva vía Excel
 * (`POST /importar`, multipart). No hay `actualizar`/`eliminar` de un
 * semestre ni de una fila de programación individual — el backend no
 * declara PATCH ni DELETE para ninguno de los dos (ver el docblock de
 * `programacion.models.ts`).
 */
@Injectable({ providedIn: 'root' })
export class ProgramacionService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = injectQueryClient();

  readonly semestres = injectQuery(() => ({
    queryKey: programacionQueryKeys.semestres,
    queryFn: () => firstValueFrom(this.http.get<Semestre[]>(`${BASE_URL}/semestres`)),
  }));

  /** Ver la nota de `ProgramacionResumen`: solo para contar registros por
   * semestre en el cliente, el backend no agrega ese conteo. */
  readonly programaciones = injectQuery(() => ({
    queryKey: programacionQueryKeys.lista,
    queryFn: () => firstValueFrom(this.http.get<ProgramacionResumen[]>(`${BASE_URL}/`)),
  }));

  /**
   * `POST /api/programacion/importar` (multipart/form-data): el único campo
   * obligatorio es `archivo`; `semestre_fecha_inicio`/`semestre_fecha_fin`
   * quedan fuera de este mutation porque son un fallback manual para cuando
   * el propio Excel no trae esas columnas (ver el docstring del endpoint en
   * el backend) — esta UI no ofrece ese formulario manual, solo el flujo
   * feliz de "el Excel ya trae sus fechas".
   */
  readonly importar = injectMutation(() => ({
    mutationFn: (archivo: File) => {
      const formData = new FormData();
      formData.append('archivo', archivo);
      return firstValueFrom(
        this.http.post<ImportarProgramacionOut>(`${BASE_URL}/importar`, formData),
      );
    },
    onSuccess: () => this.invalidar(),
  }));

  private invalidar(): void {
    this.queryClient.invalidateQueries({ queryKey: programacionQueryKeys.semestres });
    this.queryClient.invalidateQueries({ queryKey: programacionQueryKeys.lista });
  }
}
