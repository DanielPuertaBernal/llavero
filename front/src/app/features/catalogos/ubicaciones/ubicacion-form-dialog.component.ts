import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';

import { extraerMensajeError } from '../catalogos-error.util';
import type { Ubicacion } from '../catalogos.models';
import { UbicacionesService } from './ubicaciones.service';

/**
 * Diálogo de creación/edición de `Ubicacion`: `nombre` + los 3 flags de
 * permiso (`permite_prestamo_llaves`, `permite_devolucion_llaves`,
 * `permite_prestamo_equipos` — ver `UbicacionIn`/`UbicacionPatch` en
 * back/catalogos/controller.py).
 *
 * El backend NO tiene una 4ta flag "activa" (a diferencia del frontend
 * legacy, ver `Ubicacion` en back/catalogos/model.py: solo 3 booleanos) —
 * no se agrega un checkbox para algo que no existe en el modelo.
 */
@Component({
  selector: 'app-ubicacion-form-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, InputTextModule, CheckboxModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      [header]="ubicacion() ? 'Editar ubicación' : 'Nueva ubicación'"
      [modal]="true"
      [style]="{ width: '28rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="ubicacion-form-dialog__form">
        <div class="ubicacion-form-dialog__campo">
          <label for="ubicacion-nombre">Nombre</label>
          <input pInputText id="ubicacion-nombre" formControlName="nombre" />
        </div>

        <div class="ubicacion-form-dialog__campo ubicacion-form-dialog__checkbox">
          <p-checkbox
            formControlName="permite_prestamo_llaves"
            [binary]="true"
            inputId="ubicacion-prestamo-llaves"
          />
          <label for="ubicacion-prestamo-llaves">Permite préstamo de llaves</label>
        </div>

        <div class="ubicacion-form-dialog__campo ubicacion-form-dialog__checkbox">
          <p-checkbox
            formControlName="permite_devolucion_llaves"
            [binary]="true"
            inputId="ubicacion-devolucion-llaves"
          />
          <label for="ubicacion-devolucion-llaves">Permite devolución de llaves</label>
        </div>

        <div class="ubicacion-form-dialog__campo ubicacion-form-dialog__checkbox">
          <p-checkbox
            formControlName="permite_prestamo_equipos"
            [binary]="true"
            inputId="ubicacion-prestamo-equipos"
          />
          <label for="ubicacion-prestamo-equipos">Permite préstamo de equipos</label>
        </div>

        <footer class="ubicacion-form-dialog__acciones">
          <p-button type="button" label="Cancelar" severity="secondary" [text]="true" (onClick)="cancelar()" />
          <p-button type="submit" label="Guardar" [loading]="guardando()" [disabled]="form.invalid" />
        </footer>
      </form>
    </p-dialog>
  `,
})
export class UbicacionFormDialogComponent {
  readonly visible = model(false);
  readonly ubicacion = input<Ubicacion | null>(null);
  readonly guardado = output<void>();

  private readonly ubicacionesService = inject(UbicacionesService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    permite_prestamo_llaves: [true],
    permite_devolucion_llaves: [true],
    permite_prestamo_equipos: [false],
  });

  protected readonly guardando = computed(
    () => this.ubicacionesService.crear.isPending() || this.ubicacionesService.actualizar.isPending(),
  );

  constructor() {
    effect(() => {
      const ubicacionActual = this.ubicacion();
      if (ubicacionActual) {
        this.form.setValue({
          nombre: ubicacionActual.nombre,
          permite_prestamo_llaves: ubicacionActual.permite_prestamo_llaves,
          permite_devolucion_llaves: ubicacionActual.permite_devolucion_llaves,
          permite_prestamo_equipos: ubicacionActual.permite_prestamo_equipos,
        });
      } else {
        this.form.reset({
          nombre: '',
          permite_prestamo_llaves: true,
          permite_devolucion_llaves: true,
          permite_prestamo_equipos: false,
        });
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    const ubicacionActual = this.ubicacion();

    const onSuccess = () => {
      this.visible.set(false);
      this.guardado.emit();
      this.messageService.add({
        severity: 'success',
        summary: ubicacionActual ? 'Ubicación actualizada' : 'Ubicación creada',
      });
    };
    const onError = (error: unknown) =>
      this.messageService.add({
        severity: 'error',
        summary: ubicacionActual ? 'No se pudo actualizar la ubicación' : 'No se pudo crear la ubicación',
        detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
      });

    if (ubicacionActual) {
      this.ubicacionesService.actualizar.mutate({ id: ubicacionActual.id, ...valores }, { onSuccess, onError });
    } else {
      this.ubicacionesService.crear.mutate(valores, { onSuccess, onError });
    }
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
