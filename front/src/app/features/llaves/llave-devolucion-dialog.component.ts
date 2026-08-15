import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './llaves-error.util';
import { LlavesLookupsService } from './llaves-lookups.service';
import { LlavesService } from './llaves.service';
import { OPCIONES_TIPO_ENTREGA_LLAVE, type Llave, type TipoEntregaLlave } from './llaves.models';

/**
 * Diálogo de registro de DEVOLUCIÓN de una llave
 * (`POST /api/llaves/{id}/devolver`, schema `DevolverLlaveIn` — ver
 * back/llaves/controller.py). Cierra el ciclo de vida abierto por la
 * entrega: no edita la llave, dispara una transición de estado.
 *
 * La llave a devolver llega como input desde la tabla; el diálogo la
 * muestra en modo lectura (salón y quién la reclamó) para que el operador
 * confirme que está devolviendo la correcta antes de enviar.
 *
 * Nota de diseño — `novedad_id` sí se envía en `null` cuando no se elige
 * ninguna, a diferencia de `reserva_id` en el diálogo de entrega (que se
 * omite): `DevolverLlaveIn.novedad_id` es nullable de verdad y `null`
 * significa "devolución sin novedad", un caso válido y frecuente.
 *
 * Nota de diseño — las ubicaciones que NO permiten devolución siguen
 * apareciendo en el selector (solo quedan de últimas, ver
 * `LlavesLookupsService.ubicacionesDevolucion`): la validación es del
 * backend y su 400 se muestra tal cual, sin pre-chequeo cliente que
 * duplique la regla.
 *
 * Migrado de PrimeNG (`p-dialog`) a Angular Material: mismo patrón de
 * visibilidad (`model<boolean>`), implementación interna con las directivas
 * de `MatDialogModule` dentro de un overlay condicional (ver
 * `llave-entrega-dialog.component.ts` para la misma decisión).
 */
@Component({
  selector: 'app-llave-devolucion-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (click)="cancelar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="devolucion-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="devolucion-titulo">Registrar devolución</h2>

          <mat-dialog-content>
            @if (llave(); as llaveActual) {
              <dl class="llave-devolucion-dialog__resumen">
                <dt>Salón</dt>
                <dd>{{ lookups.nombreSalon(llaveActual.salon_id) }}</dd>
                <dt>Reclamada por</dt>
                <dd>{{ lookups.nombrePersona(llaveActual.reclamado_por_id) }}</dd>
              </dl>
            }

            <form [formGroup]="form" (ngSubmit)="guardar()" class="llave-devolucion-dialog__form">
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
                  formControlName="ubicacion_devolucion_id"
                  placeholder="Selecciona la ubicación"
                >
                  @for (ubicacion of lookups.ubicacionesDevolucion(); track ubicacion.id) {
                    <mat-option [value]="ubicacion.id">{{ ubicacion.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Tipo de devolución</mat-label>
                <mat-select
                  id="devolucion-tipo"
                  formControlName="tipo_devolucion"
                  placeholder="Selecciona el tipo de devolución"
                >
                  @for (opcion of opcionesTipoDevolucion; track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Novedad (opcional)</mat-label>
                <mat-select id="devolucion-novedad" formControlName="novedad_id" placeholder="Sin novedad">
                  <mat-option value="">Sin novedad</mat-option>
                  @for (novedad of lookups.opcionesNovedades(); track novedad.value) {
                    <mat-option [value]="novedad.value">{{ novedad.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
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
      width: 30rem;
      max-width: 92vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4);
    }

    .llave-devolucion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .llave-devolucion-dialog__resumen dd {
      margin: 0;
    }

    .llave-devolucion-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class LlaveDevolucionDialogComponent {
  readonly visible = model(false);
  readonly llave = input<Llave | null>(null);
  readonly guardado = output<void>();

  protected readonly lookups = inject(LlavesLookupsService);
  private readonly llavesService = inject(LlavesService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesTipoDevolucion = OPCIONES_TIPO_ENTREGA_LLAVE;

  // `novedad_id` usa `''` como "sin novedad" (mismo convenio que el resto
  // de los selectores de la feature) y se traduce a `null` al construir el
  // payload; el `mat-select` con la opción "Sin novedad" en `''` puede
  // además dejarlo así explícitamente, caso que el `?? ''` de abajo también
  // cubre.
  protected readonly form = this.fb.nonNullable.group({
    usuario_recibe_id: ['', Validators.required],
    ubicacion_devolucion_id: ['', Validators.required],
    tipo_devolucion: ['', Validators.required],
    novedad_id: [''],
  });

  protected readonly guardando = computed(() => this.llavesService.devolver.isPending());

  constructor() {
    // Cada vez que cambia la llave a devolver, el formulario vuelve a
    // cero: el diálogo es uno solo, reutilizado fila por fila desde la
    // tabla (mismo patrón que los diálogos de `catalogos`).
    effect(() => {
      this.llave();
      this.form.reset({
        usuario_recibe_id: '',
        ubicacion_devolucion_id: '',
        tipo_devolucion: '',
        novedad_id: '',
      });
    });
  }

  protected guardar(): void {
    const llaveActual = this.llave();
    if (!llaveActual || this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    const novedadId = (valores.novedad_id ?? '').trim();

    this.llavesService.devolver.mutate(
      {
        id: llaveActual.id,
        usuario_recibe_id: valores.usuario_recibe_id,
        ubicacion_devolucion_id: valores.ubicacion_devolucion_id,
        tipo_devolucion: valores.tipo_devolucion as TipoEntregaLlave,
        novedad_id: novedadId ? novedadId : null,
      },
      {
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
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
