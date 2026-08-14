import { HttpClient } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { TableModule } from 'primeng/table';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { monitoresQueryKeys } from './monitores-query-keys';
import { ETIQUETAS_DIA_SEMANA, type ClaseDocente } from './monitores.models';

const BASE_URL = `${environment.apiBaseUrl}/monitores`;

/**
 * Contenido de la fila expandida de la tabla de monitores: las clases
 * programadas del docente titular de ESA monitoría
 * (`GET /api/monitores/{id}/clases-docente-titular` — ver
 * back/monitores/controller.py). Da contexto real de horario al operador al
 * registrar o revisar una monitoría: qué clases dicta de verdad el docente
 * titular, contra las que se apoya la delegación.
 *
 * Nota de diseño — fila expandible, mismo patrón que
 * `PrestamoDetallesComponent` en `features/prestamos`: en vez de una vista de
 * detalle con su propia ruta, cada fila se expande bajo demanda y solo ahí se
 * dispara la consulta — el listado arranca con una sola petición
 * (`GET /api/monitores/`) y el costo de este segundo endpoint solo lo paga
 * quien realmente abre una fila.
 *
 * A diferencia de `PrestamoDetallesComponent`, este componente NO necesita un
 * servicio propio con una señal intermedia + `effect()`: aquí hay una sola
 * consulta (no dos), y `monitorId` ya es un `input` reactivo — la factory de
 * `injectQuery` lo lee directamente y se re-evalúa sola cuando cambia, sin
 * bridge de por medio. Tampoco hace falta que la clave de caché cuelgue de
 * `['monitores']`: este dato es de `programacion` (las clases del docente),
 * no de `monitores` — crear o desactivar una monitoría no cambia el horario
 * de nadie (ver la nota de diseño de `monitoresQueryKeys`).
 */
@Component({
  selector: 'app-monitor-clases-docente',
  standalone: true,
  imports: [TableModule],
  template: `
    @if (clases.isPending()) {
      <p class="monitor-clases-docente__estado">Cargando las clases del docente titular...</p>
    }

    @if (clases.isError()) {
      <p role="alert">No se pudieron cargar las clases del docente titular. Intenta de nuevo.</p>
    }

    <p-table [value]="clases.data() ?? []" dataKey="id" size="small">
      <ng-template #header>
        <tr>
          <th>Materia</th>
          <th>Día</th>
          <th>Hora inicio</th>
          <th>Hora fin</th>
          <th>Salón</th>
        </tr>
      </ng-template>
      <ng-template #body let-clase>
        <tr>
          <td>{{ clase.materia }}</td>
          <td>{{ diaLegible(clase) }}</td>
          <td>{{ formatearHora(clase.hora_inicio) }}</td>
          <td>{{ formatearHora(clase.hora_fin) }}</td>
          <!-- salon_id se muestra crudo a propósito: ver la nota de
               alcance de ClaseDocente en monitores.models.ts. -->
          <td>{{ clase.salon_id }}</td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5">Este docente titular no tiene clases programadas.</td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class MonitorClasesDocenteComponent {
  /** Requerido: sin monitoría esta vista no tiene nada que mostrar. */
  readonly monitorId = input.required<string>();

  private readonly http = inject(HttpClient);

  protected readonly clases = injectQuery(() => ({
    queryKey: monitoresQueryKeys.clasesDocenteTitular(this.monitorId()),
    queryFn: () =>
      firstValueFrom(
        this.http.get<ClaseDocente[]>(`${BASE_URL}/${this.monitorId()}/clases-docente-titular`),
      ),
  }));

  protected diaLegible(clase: ClaseDocente): string {
    return ETIQUETAS_DIA_SEMANA[clase.dia];
  }

  protected formatearHora(hora: string): string {
    const partes = /^(\d{2}):(\d{2})/.exec(hora);
    return partes ? `${partes[1]}:${partes[2]}` : hora;
  }
}
