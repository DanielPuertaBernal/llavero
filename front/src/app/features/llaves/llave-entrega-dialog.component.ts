import { Component, computed, effect, inject, model, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './llaves-error.util';
import { LlavesLookupsService } from './llaves-lookups.service';
import { LlavesService } from './llaves.service';
import {
  OPCIONES_ORIGEN_LLAVE,
  OPCIONES_TIPO_ENTREGA_LLAVE,
  type LlaveInput,
  type OrigenLlave,
  type TipoEntregaLlave,
} from './llaves.models';

/**
 * Diálogo de registro de ENTREGA de una llave (`POST /api/llaves/`, schema
 * `LlaveIn` — ver back/llaves/controller.py). Es el único "crear" de la
 * feature: no existe un modo edición, porque el backend no expone PATCH
 * sobre llaves.
 *
 * Los 7 campos requeridos son exactamente los de `LlaveIn`; cada FK se
 * elige con un `mat-select` alimentado por `LlavesLookupsService`, nunca
 * pegando un UUID a mano.
 *
 * Nota de diseño — `reserva_id`: el backend lo acepta SOLO junto con
 * `origen === 'reserva_individual'` y responde 400 si llega con cualquier
 * otro origen (ver `crear_llave` en back/llaves/service.py). Por eso el
 * campo se muestra únicamente con ese origen y, sobre todo, se OMITE del
 * payload en el resto de los casos — enviarlo en `null` sería igual de
 * incorrecto conceptualmente y depende de que el backend trate `null` como
 * "no enviado". El resto de las reglas de negocio (¿la ubicación permite
 * préstamo?, ¿el salón ya tiene una llave prestada?) NO se replican acá: se
 * envían y se muestra el mensaje del 400 tal cual (ver
 * llaves-error.util.ts).
 *
 * Migrado de PrimeNG (`p-dialog`) a Angular Material: se mantiene el mismo
 * patrón de visibilidad (`model<boolean>` en vez de `MatDialog.open()`) para
 * no romper la API pública del componente (`app-llave-entrega-dialog
 * [(visible)]="..."` en `llaves-list.component.ts`); la implementación
 * interna usa las directivas reales de `MatDialogModule`
 * (`mat-dialog-title`/`mat-dialog-content`/`mat-dialog-actions`) dentro de
 * un overlay condicional.
 */
@Component({
  selector: 'app-llave-entrega-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
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
          aria-labelledby="entrega-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="entrega-titulo">Registrar entrega de llave</h2>

          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="llave-entrega-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Salón</mat-label>
                <mat-select id="entrega-salon" formControlName="salon_id" placeholder="Selecciona un salón">
                  @for (salon of lookups.salones.data() ?? []; track salon.id) {
                    <mat-option [value]="salon.id">{{ salon.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Docente titular</mat-label>
                <mat-select
                  id="entrega-docente-titular"
                  formControlName="docente_titular_id"
                  placeholder="Selecciona al docente titular"
                >
                  @for (persona of lookups.opcionesPersonas(); track persona.value) {
                    <mat-option [value]="persona.value">{{ persona.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Reclamado por</mat-label>
                <mat-select
                  id="entrega-reclamado-por"
                  formControlName="reclamado_por_id"
                  placeholder="Selecciona quién reclama la llave"
                >
                  @for (persona of lookups.opcionesPersonas(); track persona.value) {
                    <mat-option [value]="persona.value">{{ persona.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Origen</mat-label>
                <mat-select id="entrega-origen" formControlName="origen" placeholder="Selecciona el origen">
                  @for (opcion of opcionesOrigen; track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              @if (requiereReserva()) {
                <mat-form-field appearance="outline">
                  <mat-label>Reserva individual</mat-label>
                  <input
                    matInput
                    id="entrega-reserva"
                    formControlName="reserva_id"
                    placeholder="Identificador de la reserva (opcional)"
                  />
                </mat-form-field>
              }

              <mat-form-field appearance="outline">
                <mat-label>Tipo de entrega</mat-label>
                <mat-select
                  id="entrega-tipo"
                  formControlName="tipo_entrega"
                  placeholder="Selecciona el tipo de entrega"
                >
                  @for (opcion of opcionesTipoEntrega; track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Usuario que entrega</mat-label>
                <mat-select
                  id="entrega-usuario"
                  formControlName="usuario_entrega_id"
                  placeholder="Selecciona quién entrega"
                >
                  @for (usuario of lookups.opcionesUsuarios(); track usuario.value) {
                    <mat-option [value]="usuario.value">{{ usuario.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ubicación de entrega</mat-label>
                <mat-select
                  id="entrega-ubicacion"
                  formControlName="ubicacion_entrega_id"
                  placeholder="Selecciona la ubicación"
                >
                  @for (ubicacion of lookups.ubicacionesEntrega(); track ubicacion.id) {
                    <mat-option [value]="ubicacion.id">{{ ubicacion.nombre }}</mat-option>
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
                Registrar entrega
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

    .llave-entrega-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class LlaveEntregaDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(LlavesLookupsService);
  private readonly llavesService = inject(LlavesService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesOrigen = OPCIONES_ORIGEN_LLAVE;
  protected readonly opcionesTipoEntrega = OPCIONES_TIPO_ENTREGA_LLAVE;

  // Todos los controles son `string` (los ids son UUID y los enums viajan
  // como string): `''` representa "sin seleccionar" y `Validators.required`
  // lo rechaza. Los dos campos de enum se castean al construir el payload —
  // el `mat-select` solo ofrece los valores de `OPCIONES_*`, derivados del
  // propio enum del backend.
  protected readonly form = this.fb.nonNullable.group({
    salon_id: ['', Validators.required],
    docente_titular_id: ['', Validators.required],
    reclamado_por_id: ['', Validators.required],
    origen: ['', Validators.required],
    tipo_entrega: ['', Validators.required],
    usuario_entrega_id: ['', Validators.required],
    ubicacion_entrega_id: ['', Validators.required],
    // `reserva_id` es un `uuid.UUID` en el backend (`LlaveIn.reserva_id`, ver
    // back/llaves/controller.py) pero acá se escribe a mano en vez de
    // elegirse de un selector (no hay endpoint de búsqueda de reservas para
    // alimentar uno) — el `pattern` valida la FORMA de un UUID antes de
    // pagar el viaje de red; sigue siendo opcional (`Validators.pattern` no
    // rechaza `''`).
    reserva_id: ['', Validators.pattern(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)],
  });

  private readonly origenSeleccionado = toSignal(this.form.controls.origen.valueChanges, {
    initialValue: this.form.controls.origen.value,
  });

  protected readonly requiereReserva = computed(
    () => this.origenSeleccionado() === 'reserva_individual',
  );

  protected readonly guardando = computed(() => this.llavesService.crear.isPending());

  constructor() {
    // Al cambiar a un origen que no admite reserva, se limpia el campo: así
    // un valor tecleado y luego "escondido" no queda en el formulario
    // esperando a que el usuario vuelva a ese origen.
    effect(() => {
      if (!this.requiereReserva() && this.form.controls.reserva_id.value !== '') {
        this.form.controls.reserva_id.setValue('');
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    const reservaId = valores.reserva_id.trim();

    const payload: LlaveInput = {
      salon_id: valores.salon_id,
      docente_titular_id: valores.docente_titular_id,
      reclamado_por_id: valores.reclamado_por_id,
      origen: valores.origen as OrigenLlave,
      tipo_entrega: valores.tipo_entrega as TipoEntregaLlave,
      usuario_entrega_id: valores.usuario_entrega_id,
      ubicacion_entrega_id: valores.ubicacion_entrega_id,
      // Ver la nota de diseño del docblock: la clave ni siquiera aparece
      // cuando el origen no es 'reserva_individual'.
      ...(this.requiereReserva() && reservaId ? { reserva_id: reservaId } : {}),
    };

    this.llavesService.crear.mutate(payload, {
      onSuccess: () => {
        this.visible.set(false);
        this.form.reset();
        this.guardado.emit();
        this.notificationService.success('Entrega registrada');
      },
      onError: (error) =>
        this.notificationService.error(
          'No se pudo registrar la entrega',
          extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        ),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
