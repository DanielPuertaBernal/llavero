import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

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
 * (es al revés, ver novedades.models.ts), así que esta tabla-simple NUNCA muestra
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
 * `mat-select` ajeno se entere solo.
 *
 * Nota de diseño — a diferencia de `usuarios`/`monitores`, acá NO hay filtro
 * de texto: `NovedadOut` no trae ningún campo propio corto que identifique
 * una fila a simple vista (la categoría y el estado ya tienen su propio
 * selector, y la descripción es texto libre potencialmente largo), así que
 * no se agrega un buscador que filtraría sobre casi nada útil.
 *
 * Migración PrimeNG → Angular Material: `p-toast`/`MessageService` se
 * reemplazan por `NotificationService` en los diálogos hijos (esta lista no
 * lanzaba toasts propios), `p-select` por `mat-select` (con un botón
 * "Limpiar" propio porque `mat-select` no trae un `showClear` equivalente al
 * de PrimeNG), `p-button` por `button[mat-button]`, `p-table` por una tabla-simple
 * HTML simple (sin sorting/paginación real) y `p-tag` por un badge de estado
 * con los colores de la especificación visual UCO (verde institucional para
 * "Cerrada", amarillo institucional con texto oscuro para "Abierta").
 */
@Component({
  selector: 'app-novedades-list',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    NovedadFormDialogComponent,
    NovedadCierreDialogComponent,
  ],
  template: `
    <header class="novedades-list__header">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Estado</mat-label>
        <mat-select
          [ngModel]="filtroEstadoUi()"
          (ngModelChange)="onEstadoChange($event)"
          aria-label="Filtrar por estado"
          placeholder="Todos los estados"
        >
          <mat-option [value]="null">Todos los estados</mat-option>
          @for (opcion of opcionesEstado; track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Categoría</mat-label>
        <mat-select
          [ngModel]="filtroCategoriaUi()"
          (ngModelChange)="onCategoriaChange($event)"
          aria-label="Filtrar por categoría"
          placeholder="Todas las categorías"
        >
          <mat-option [value]="null">Todas las categorías</mat-option>
          @for (opcion of opcionesCategoria; track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button mat-raised-button color="primary" type="button" (click)="abrirCrear()">
        Nueva novedad
      </button>
    </header>

    @if (novedadesService.novedades.isError()) {
      <p role="alert">No se pudieron cargar las novedades. Intenta de nuevo.</p>
    } @else if (cargando()) {
      <p>Cargando novedades…</p>
    } @else {
      <table class="tabla-simple">
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Descripción</th>
            <th>Registrada por</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (novedad of novedadesService.novedades.data() ?? []; track novedad.id) {
            <tr>
              <td>{{ etiquetaCategoria(novedad) }}</td>
              <td>{{ novedad.descripcion ?? 'Sin descripción registrada' }}</td>
              <td>{{ lookups.nombreUsuario(novedad.registrado_por_id) }}</td>
              <td>
                <span [class]="claseBadgeEstado(novedad)">{{ etiquetaEstado(novedad) }}</span>
              </td>
              <td>
                <button
                  mat-icon-button
                  type="button"
                  [disabled]="novedad.estado !== 'abierta'"
                  (click)="abrirCierre(novedad)"
                  aria-label="Cerrar novedad"
                  title="Cerrar novedad"
                >
                  <mat-icon>check_circle</mat-icon>
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5" class="tabla-simple-simple__estado-vacio">
                No hay novedades que coincidan con el filtro.
              </td>
            </tr>
          }
        </tbody>
      </table>
    }

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

    .tabla-simple {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }

    .tabla-simple th {
      background: #f5f7f6;
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 12px;
      font-weight: 700;
      color: #1a1a1a;
      text-align: left;
      padding: var(--space-2) var(--space-3);
    }

    .tabla-simple td {
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      text-align: left;
      padding: var(--space-2) var(--space-3);
    }

    .tabla-simple-simple__estado-vacio {
      text-align: center;
      font-family: Montserrat, sans-serif;
      font-style: italic;
      color: #6b7280;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 10px;
      font-family: Poppins, sans-serif;
      font-size: 11px;
      font-weight: 700;
    }

    .badge--atencion {
      background: #ffca00;
      color: #1a1a1a;
    }

    .badge--exito {
      background: #008b50;
      color: #ffffff;
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

  protected claseBadgeEstado(novedad: Novedad): string {
    return novedad.estado === 'abierta' ? 'badge badge--atencion' : 'badge badge--exito';
  }

  protected abrirCrear(): void {
    this.formDialogVisible.set(true);
  }

  protected abrirCierre(novedad: Novedad): void {
    this.novedadACerrar.set(novedad);
    this.cierreDialogVisible.set(true);
  }
}
