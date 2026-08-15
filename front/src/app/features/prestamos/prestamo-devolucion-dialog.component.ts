import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../core/shared/notification.service';
import { PrestamoDetallesService } from './prestamo-detalles.service';
import { extraerMensajeError } from './prestamos-error.util';
import { PrestamosLookupsService } from './prestamos-lookups.service';
import { PrestamosService } from './prestamos.service';
import type { DevolucionInput, Prestamo } from './prestamos.models';

/**
 * Diálogo de DEVOLUCIÓN de equipos de un préstamo
 * (`POST /api/prestamos/{id}/devolver`, schema `DevolverEquiposIn` — ver
 * back/prestamos/controller.py). No edita el préstamo: dispara una
 * transición: devolver algunos equipos lo deja `parcialmente_devuelto`,
 * devolver los últimos lo deja `completamente_devuelto`.
 *
 * Nota de arquitectura — el diálogo provee su propia instancia de
 * `PrestamoDetallesService` (misma razón que la fila expandida, ver el
 * docblock de ese servicio): necesita los detalles del préstamo
 * seleccionado para saber qué equipos siguen `entregado`, y un singleton de
 * raíz con una sola señal `prestamoId` no puede servir a la vez a este
 * diálogo y a las filas expandidas de la tabla. Comparten caché por clave,
 * así que no se duplican peticiones.
 *
 * Nota de diseño — el multiselect ofrece SOLO los equipos todavía
 * `entregado`. Eso no es duplicar una regla de negocio: es no ofrecer una
 * opción que el propio préstamo ya declaró cerrada en su
 * `DetallePrestamoOut.estado_equipo`. Las reglas que sí son del backend (que
 * el equipo pertenezca al préstamo, que no esté ya devuelto por una carrera
 * entre pestañas) se dejan responder con su 400, que se muestra tal cual.
 *
 * Nota de diseño — `novedades_por_equipo` se OMITE del payload cuando ningún
 * equipo tiene novedad, y cuando la tiene solo incluye los equipos elegidos.
 * El schema lo declara `dict[...] | None = None`: mandar `{}` diría "hay un
 * mapa vacío", que no es lo mismo que "no hay novedades" y dependería de que
 * el backend trate ambos casos igual.
 *
 * Nota de diseño — la ubicación de devolución NO se ordena ni se filtra:
 * `Ubicacion` no tiene un flag `permite_devolucion_equipos` y
 * `service.devolver_equipos` no valida permiso alguno de ubicación al
 * recibir. Inventar acá esa restricción sería agregar una regla que el
 * dominio no tiene.
 *
 * Migrado de PrimeNG (`p-dialog`) a Angular Material: mismo patrón de
 * visibilidad (`model<boolean>`), implementación interna con las directivas
 * de `MatDialogModule` dentro de un overlay condicional (ver
 * `llave-entrega-dialog.component.ts` para la misma decisión). El
 * `p-multiselect` con chips se simplifica a un `mat-select [multiple]`; el
 * `[showClear]` de los selects de novedad por equipo se reemplaza por una
 * opción explícita "Sin novedad" en `''`.
 */
@Component({
  selector: 'app-prestamo-devolucion-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  providers: [PrestamoDetallesService],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (click)="cancelar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prestamo-devolucion-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="prestamo-devolucion-titulo">Devolver equipos</h2>

          <mat-dialog-content>
            @if (prestamo(); as prestamoActual) {
              <dl class="prestamo-devolucion-dialog__resumen">
                <dt>Solicitante</dt>
                <dd>{{ lookups.nombrePersona(prestamoActual.solicitante_id) }}</dd>
                <dt>Ubicación del préstamo</dt>
                <dd>{{ lookups.nombreUbicacion(prestamoActual.ubicacion_id) }}</dd>
              </dl>
            }

            <form [formGroup]="form" (ngSubmit)="guardar()" class="prestamo-devolucion-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Usuario que recibe</mat-label>
                <mat-select
                  id="devolucion-usuario"
                  formControlName="usuario_recibe_id"
                  placeholder="Selecciona quién recibe"
                >
                  @for (usuario of lookups.opcionesUsuarios(); track usuario.value) {
                    <mat-option [value]="usuario.value">{{ usuario.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ubicación de devolución</mat-label>
                <mat-select
                  id="devolucion-ubicacion"
                  formControlName="ubicacion_id"
                  placeholder="Selecciona la ubicación"
                >
                  @for (ubicacion of lookups.ubicacionesDevolucion(); track ubicacion.id) {
                    <mat-option [value]="ubicacion.id">{{ ubicacion.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Equipos a devolver</mat-label>
                <mat-select
                  id="devolucion-equipos"
                  formControlName="equipo_ids"
                  multiple
                  placeholder="Selecciona al menos un equipo"
                >
                  @for (equipo of opcionesEquiposDevolver(); track equipo.value) {
                    <mat-option [value]="equipo.value">{{ equipo.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              @for (equipoId of equiposSeleccionados(); track equipoId) {
                <mat-form-field appearance="outline">
                  <mat-label>Novedad de {{ lookups.nombreEquipo(equipoId) }} (opcional)</mat-label>
                  <mat-select
                    [id]="'devolucion-novedad-' + equipoId"
                    placeholder="Sin novedad"
                    [ngModel]="novedadDe(equipoId)"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="onNovedadChange(equipoId, $event)"
                  >
                    <mat-option value="">Sin novedad</mat-option>
                    @for (novedad of lookups.opcionesNovedades(); track novedad.value) {
                      <mat-option [value]="novedad.value">{{ novedad.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
            </form>
          </mat-dialog-content>

          <mat-dialog-actions align="end">
            <button type="button" mat-stroked-button (click)="cancelar()">Cancelar</button>
            <button
              type="submit"
              mat-raised-button
              color="primary"
              [disabled]="form.invalid || guardando()"
              (click)="guardar()"
            >
              @if (guardando()) {
                <mat-spinner diameter="18" />
              } @else {
                Registrar devolución
              }
            </button>
          </mat-dialog-actions>
        </div>
      </div>
    }
  `,
  styles: `
    .dialogo__overlay {
      position: fixed;
      inset: 0;
      background: rgba(26, 26, 26, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialogo__panel {
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(26, 26, 26, 0.24);
      width: 32rem;
      max-width: 92vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4);
    }

    .prestamo-devolucion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .prestamo-devolucion-dialog__resumen dd {
      margin: 0;
    }

    .prestamo-devolucion-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class PrestamoDevolucionDialogComponent {
  readonly visible = model(false);
  readonly prestamo = input<Prestamo | null>(null);
  readonly guardado = output<void>();

  protected readonly lookups = inject(PrestamosLookupsService);
  protected readonly detallesService = inject(PrestamoDetallesService);
  private readonly prestamosService = inject(PrestamosService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    usuario_recibe_id: ['', Validators.required],
    ubicacion_id: ['', Validators.required],
    equipo_ids: this.fb.nonNullable.control<string[]>(
      [],
      [Validators.required, Validators.minLength(1)],
    ),
  });

  /**
   * `equipo_id -> novedad_id` de los equipos que el operador marcó con
   * novedad. Vive fuera del `FormGroup` (con `[ngModel]` standalone) porque
   * su forma depende de la selección del multiselect: agregar y quitar
   * controles del grupo en cada cambio de selección sería más frágil que un
   * único mapa, y este valor no participa de la validez del formulario — la
   * novedad es opcional.
   */
  protected readonly novedadesPorEquipo = signal<Record<string, string>>({});

  /** Los equipos elegidos, para renderizar un selector de novedad por cada uno. */
  protected readonly equiposSeleccionados = toSignal(this.form.controls.equipo_ids.valueChanges, {
    initialValue: this.form.controls.equipo_ids.value,
  });

  /**
   * Opciones del multiselect: solo los equipos que siguen `entregado` en
   * este préstamo. Se arma desde los ids del propio préstamo (no filtrando
   * el catálogo global) para que la lista sea correcta aunque el lookup de
   * equipos todavía no haya cargado — en ese caso la etiqueta cae al id
   * crudo, igual que en el resto de la feature.
   */
  protected readonly opcionesEquiposDevolver = computed(() =>
    this.detallesService.equiposEntregados().map((equipoId) => ({
      label: this.lookups.nombreEquipo(equipoId),
      value: equipoId,
    })),
  );

  protected readonly guardando = computed(() => this.prestamosService.devolverEquipos.isPending());

  constructor() {
    // Cada vez que cambia el préstamo a devolver: se apunta el servicio de
    // detalles al nuevo id (lo que habilita/rehace sus dos consultas) y el
    // formulario vuelve a cero. El diálogo es uno solo, reutilizado fila por
    // fila desde la tabla (mismo patrón que los diálogos de `llaves`).
    effect(() => {
      const prestamoActual = this.prestamo();
      this.detallesService.prestamoId.set(prestamoActual?.id ?? null);
      this.form.reset({ usuario_recibe_id: '', ubicacion_id: '', equipo_ids: [] });
      this.novedadesPorEquipo.set({});
    });
  }

  /** Novedad elegida para ese equipo, o `''` si no tiene — la forma que el
   * `mat-select` con la opción "Sin novedad" espera para mostrarse vacío. */
  protected novedadDe(equipoId: string): string {
    return this.novedadesPorEquipo()[equipoId] ?? '';
  }

  /** `''` (la opción "Sin novedad" del selector) equivale a "sin novedad": se
   * quita la entrada del mapa en vez de guardar un valor vacío. */
  protected onNovedadChange(equipoId: string, novedadId: string): void {
    this.novedadesPorEquipo.update((mapa) => {
      const siguiente = { ...mapa };
      if (novedadId) {
        siguiente[equipoId] = novedadId;
      } else {
        delete siguiente[equipoId];
      }
      return siguiente;
    });
  }

  protected guardar(): void {
    const prestamoActual = this.prestamo();
    if (!prestamoActual || this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    const mapa = this.novedadesPorEquipo();

    // Solo los equipos que (a) siguen seleccionados y (b) tienen novedad
    // elegida: si alguien marca una novedad y luego quita ese equipo del
    // multiselect, la entrada huérfana no debe viajar.
    const novedades = Object.fromEntries(
      valores.equipo_ids
        .filter((equipoId) => mapa[equipoId])
        .map((equipoId) => [equipoId, mapa[equipoId]]),
    );

    const payload: { id: string } & DevolucionInput = {
      id: prestamoActual.id,
      usuario_recibe_id: valores.usuario_recibe_id,
      ubicacion_id: valores.ubicacion_id,
      equipo_ids: valores.equipo_ids,
      // Ver la nota de diseño del docblock: la clave ni siquiera aparece
      // cuando ningún equipo tiene novedad.
      ...(Object.keys(novedades).length > 0 ? { novedades_por_equipo: novedades } : {}),
    };

    this.prestamosService.devolverEquipos.mutate(payload, {
      onSuccess: () => {
        this.visible.set(false);
        this.guardado.emit();
        this.notificationService.success('Devolución registrada');
      },
      onError: (error) =>
        this.notificationService.error(
          'No se pudo registrar la devolución',
          extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        ),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
