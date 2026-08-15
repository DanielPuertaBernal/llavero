import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';

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
 */
@Component({
  selector: 'app-llave-devolucion-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, SelectModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Registrar devolución"
      [modal]="true"
      [style]="{ width: '30rem' }"
    >
      @if (llave(); as llaveActual) {
        <dl class="llave-devolucion-dialog__resumen">
          <dt>Salón</dt>
          <dd>{{ lookups.nombreSalon(llaveActual.salon_id) }}</dd>
          <dt>Reclamada por</dt>
          <dd>{{ lookups.nombrePersona(llaveActual.reclamado_por_id) }}</dd>
        </dl>
      }

      <form [formGroup]="form" (ngSubmit)="guardar()" class="llave-devolucion-dialog__form">
        <div class="llave-devolucion-dialog__campo">
          <label for="devolucion-usuario">Usuario que recibe</label>
          <p-select
            id="devolucion-usuario"
            formControlName="usuario_recibe_id"
            [options]="lookups.opcionesUsuarios()"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona quién recibe"
          />
        </div>

        <div class="llave-devolucion-dialog__campo">
          <label for="devolucion-ubicacion">Ubicación de devolución</label>
          <p-select
            id="devolucion-ubicacion"
            formControlName="ubicacion_devolucion_id"
            [options]="lookups.ubicacionesDevolucion()"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Selecciona la ubicación"
          />
        </div>

        <div class="llave-devolucion-dialog__campo">
          <label for="devolucion-tipo">Tipo de devolución</label>
          <p-select
            id="devolucion-tipo"
            formControlName="tipo_devolucion"
            [options]="opcionesTipoDevolucion"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona el tipo de devolución"
          />
        </div>

        <div class="llave-devolucion-dialog__campo">
          <label for="devolucion-novedad">Novedad (opcional)</label>
          <p-select
            id="devolucion-novedad"
            formControlName="novedad_id"
            [options]="lookups.opcionesNovedades()"
            optionLabel="label"
            optionValue="value"
            [showClear]="true"
            placeholder="Sin novedad"
          />
        </div>

        <footer class="llave-devolucion-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Registrar devolución"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
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
      gap: var(--space-4);
    }

    .llave-devolucion-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .llave-devolucion-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class LlaveDevolucionDialogComponent {
  readonly visible = model(false);
  readonly llave = input<Llave | null>(null);
  readonly guardado = output<void>();

  protected readonly lookups = inject(LlavesLookupsService);
  private readonly llavesService = inject(LlavesService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesTipoDevolucion = OPCIONES_TIPO_ENTREGA_LLAVE;

  // `novedad_id` usa `''` como "sin novedad" (mismo convenio que el resto
  // de los selectores de la feature) y se traduce a `null` al construir el
  // payload; `p-select` con `[showClear]` puede además dejarlo en `null`,
  // caso que el `?? ''` de abajo también cubre.
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
          this.messageService.add({ severity: 'success', summary: 'Devolución registrada' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo registrar la devolución',
            detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
          }),
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
