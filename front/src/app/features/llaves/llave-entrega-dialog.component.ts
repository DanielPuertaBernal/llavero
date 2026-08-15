import { Component, computed, effect, inject, model, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

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
 * elige con un `p-select` alimentado por `LlavesLookupsService`, nunca
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
 */
@Component({
  selector: 'app-llave-entrega-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, InputTextModule, SelectModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Registrar entrega de llave"
      [modal]="true"
      [style]="{ width: '32rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="llave-entrega-dialog__form">
        <div class="llave-entrega-dialog__campo">
          <label for="entrega-salon">Salón</label>
          <p-select
            id="entrega-salon"
            formControlName="salon_id"
            [options]="lookups.salones.data() ?? []"
            optionLabel="nombre"
            optionValue="id"
            [filter]="true"
            filterBy="nombre"
            placeholder="Selecciona un salón"
          />
        </div>

        <div class="llave-entrega-dialog__campo">
          <label for="entrega-docente-titular">Docente titular</label>
          <p-select
            id="entrega-docente-titular"
            formControlName="docente_titular_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona al docente titular"
          />
        </div>

        <div class="llave-entrega-dialog__campo">
          <label for="entrega-reclamado-por">Reclamado por</label>
          <p-select
            id="entrega-reclamado-por"
            formControlName="reclamado_por_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona quién reclama la llave"
          />
        </div>

        <div class="llave-entrega-dialog__campo">
          <label for="entrega-origen">Origen</label>
          <p-select
            id="entrega-origen"
            formControlName="origen"
            [options]="opcionesOrigen"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona el origen"
          />
        </div>

        @if (requiereReserva()) {
          <div class="llave-entrega-dialog__campo">
            <label for="entrega-reserva">Reserva individual</label>
            <input
              pInputText
              id="entrega-reserva"
              formControlName="reserva_id"
              placeholder="Identificador de la reserva (opcional)"
            />
          </div>
        }

        <div class="llave-entrega-dialog__campo">
          <label for="entrega-tipo">Tipo de entrega</label>
          <p-select
            id="entrega-tipo"
            formControlName="tipo_entrega"
            [options]="opcionesTipoEntrega"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona el tipo de entrega"
          />
        </div>

        <div class="llave-entrega-dialog__campo">
          <label for="entrega-usuario">Usuario que entrega</label>
          <p-select
            id="entrega-usuario"
            formControlName="usuario_entrega_id"
            [options]="lookups.opcionesUsuarios()"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona quién entrega"
          />
        </div>

        <div class="llave-entrega-dialog__campo">
          <label for="entrega-ubicacion">Ubicación de entrega</label>
          <p-select
            id="entrega-ubicacion"
            formControlName="ubicacion_entrega_id"
            [options]="lookups.ubicacionesEntrega()"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Selecciona la ubicación"
          />
        </div>

        <footer class="llave-entrega-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Registrar entrega"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
    .llave-entrega-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .llave-entrega-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .llave-entrega-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class LlaveEntregaDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(LlavesLookupsService);
  private readonly llavesService = inject(LlavesService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesOrigen = OPCIONES_ORIGEN_LLAVE;
  protected readonly opcionesTipoEntrega = OPCIONES_TIPO_ENTREGA_LLAVE;

  // Todos los controles son `string` (los ids son UUID y los enums viajan
  // como string): `''` representa "sin seleccionar" y `Validators.required`
  // lo rechaza. Los dos campos de enum se castean al construir el payload —
  // el `p-select` solo ofrece los valores de `OPCIONES_*`, derivados del
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
        this.messageService.add({ severity: 'success', summary: 'Entrega registrada' });
      },
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo registrar la entrega',
          detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        }),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
