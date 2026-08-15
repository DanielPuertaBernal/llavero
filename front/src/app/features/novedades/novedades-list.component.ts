import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

import { NovedadCierreDialogComponent } from './novedad-cierre-dialog.component';
import { NovedadFormDialogComponent } from './novedad-form-dialog.component';
import { NovedadesLookupsService } from './novedades-lookups.service';
import { NovedadesService } from './novedades.service';
import {
  ETIQUETAS_CATEGORIA_NOVEDAD,
  ETIQUETAS_ESTADO_NOVEDAD,
  OPCIONES_CATEGORIA_NOVEDAD,
  OPCIONES_ESTADO_NOVEDAD,
  type CategoriaNovedad,
  type EstadoNovedad,
  type Novedad,
} from './novedades.models';

/**
 * Vista principal de Novedades: el registro de incidentes (daños, pérdidas,
 * otros) reportados sobre llaves o equipos.
 *
 * Estructuralmente es la MÁS parecida a `UsuariosListComponent`: crear y una
 * ÚNICA transición de estado (acá `cerrar` en vez de `desactivar`), sin PATCH
 * ni DELETE (ver back/novedades/controller.py). A diferencia de `usuarios`
 * (que sí expone `reactivar`), acá no hay vuelta atrás: `cerrar` es la única
 * transición y no tiene endpoint de reapertura, así que la columna de
 * acciones tiene un único botón, "Cerrar novedad", y no hay editar.
 *
 * Nota de alcance — dominio: una `Novedad` NO tiene FK hacia `Llave`/`Equipo`
 * (es al revés, ver novedades.models.ts), así que esta tabla NUNCA muestra
 * "a qué llave/equipo pertenece" una novedad — el backend de novedades no
 * expone esa relación inversa y no es su responsabilidad.
 *
 * Nota de diseño — los DOS filtros (estado, categoría) son de SERVIDOR y
 * MUTUAMENTE EXCLUYENTES, mismo criterio que `ReservasListComponent` con
 * `filtroSolicitante`/`filtroEstado`: `onEstadoChange` limpia
 * `filtroCategoria` y viceversa, porque el backend no expone un endpoint
 * combinado estado+categoría y `NovedadesService.novedades` solo puede
 * alimentarse de UNO de los tres (`GET /`, `GET /estado/{estado}`,
 * `GET /categoria/{categoria}`) a la vez — ver la nota de diseño de
 * precedencia en `novedades.service.ts`. Los dos selectores viven en señales
 * PROPIAS del componente (`filtroEstadoUi`/`filtroCategoriaUi`) en vez de leer
 * directamente `NovedadesService.filtroEstado`/`filtroCategoria` en el
 * template, para poder limpiar el otro selector sin depender de que el
 * `p-select` ajeno se entere solo.
 *
 * Nota de diseño — a diferencia de `usuarios`/`monitores`, acá NO hay filtro
 * de texto: `NovedadOut` no trae ningún campo propio corto que identifique
 * una fila a simple vista (la categoría y el estado ya tienen su propio
 * selector, y la descripción es texto libre potencialmente largo), así que
 * no se agrega un buscador que filtraría sobre casi nada útil.
 */
@Component({
  selector: 'app-novedades-list',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    TagModule,
    ToastModule,
    NovedadFormDialogComponent,
    NovedadCierreDialogComponent,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <header class="novedades-list__header">
      <p-select
        [options]="opcionesEstado"
        optionLabel="label"
        optionValue="value"
        [ngModel]="filtroEstadoUi()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onEstadoChange($event)"
        [showClear]="true"
        ariaLabel="Filtrar por estado"
        placeholder="Todos los estados"
      />
      <p-select
        [options]="opcionesCategoria"
        optionLabel="label"
        optionValue="value"
        [ngModel]="filtroCategoriaUi()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onCategoriaChange($event)"
        [showClear]="true"
        ariaLabel="Filtrar por categoría"
        placeholder="Todas las categorías"
      />
      <p-button label="Nueva novedad" icon="pi pi-plus" (onClick)="abrirCrear()" />
    </header>

    @if (novedadesService.novedades.isError()) {
      <p role="alert">No se pudieron cargar las novedades. Intenta de nuevo.</p>
    }

    <p-table [value]="novedadesService.novedades.data() ?? []" [loading]="cargando()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Categoría</th>
          <th>Descripción</th>
          <th>Registrada por</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-novedad>
        <tr>
          <td>{{ etiquetaCategoria(novedad) }}</td>
          <td>{{ novedad.descripcion ?? 'Sin descripción registrada' }}</td>
          <td>{{ lookups.nombreUsuario(novedad.registrado_por_id) }}</td>
          <td>
            <p-tag
              [severity]="novedad.estado === 'abierta' ? 'warn' : 'success'"
              [value]="etiquetaEstado(novedad)"
            />
          </td>
          <td>
            <p-button
              icon="pi pi-check"
              severity="danger"
              [text]="true"
              [disabled]="novedad.estado !== 'abierta'"
              (onClick)="abrirCierre(novedad)"
              [ariaLabel]="'Cerrar novedad'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5">No hay novedades que coincidan con el filtro.</td>
        </tr>
      </ng-template>
    </p-table>

    <app-novedad-form-dialog [(visible)]="formDialogVisible" />
    <app-novedad-cierre-dialog [(visible)]="cierreDialogVisible" [novedad]="novedadACerrar()" />
  `,
  styles: `
    .novedades-list__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }
  `,
})
export class NovedadesListComponent {
  protected readonly novedadesService = inject(NovedadesService);
  protected readonly lookups = inject(NovedadesLookupsService);

  protected readonly opcionesEstado = OPCIONES_ESTADO_NOVEDAD;
  protected readonly opcionesCategoria = OPCIONES_CATEGORIA_NOVEDAD;

  /** Espejo local de los filtros del servicio: existe para poder limpiar el
   * selector "hermano" al elegir uno (ver la nota de diseño del docblock). */
  protected readonly filtroEstadoUi = signal<EstadoNovedad | null>(null);
  protected readonly filtroCategoriaUi = signal<CategoriaNovedad | null>(null);

  protected readonly formDialogVisible = signal(false);
  protected readonly cierreDialogVisible = signal(false);
  protected readonly novedadACerrar = signal<Novedad | null>(null);

  protected readonly cargando = computed(() => this.novedadesService.novedades.isPending());

  protected onEstadoChange(estado: EstadoNovedad | null): void {
    this.filtroEstadoUi.set(estado);
    this.filtroCategoriaUi.set(null);
    this.novedadesService.filtroEstado.set(estado);
    this.novedadesService.filtroCategoria.set(null);
  }

  protected onCategoriaChange(categoria: CategoriaNovedad | null): void {
    this.filtroCategoriaUi.set(categoria);
    this.filtroEstadoUi.set(null);
    this.novedadesService.filtroCategoria.set(categoria);
    this.novedadesService.filtroEstado.set(null);
  }

  protected etiquetaCategoria(novedad: Novedad): string {
    return ETIQUETAS_CATEGORIA_NOVEDAD[novedad.categoria as CategoriaNovedad];
  }

  protected etiquetaEstado(novedad: Novedad): string {
    return ETIQUETAS_ESTADO_NOVEDAD[novedad.estado as EstadoNovedad];
  }

  protected abrirCrear(): void {
    this.formDialogVisible.set(true);
  }

  protected abrirCierre(novedad: Novedad): void {
    this.novedadACerrar.set(novedad);
    this.cierreDialogVisible.set(true);
  }
}
