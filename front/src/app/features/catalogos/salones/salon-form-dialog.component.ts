import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { extraerMensajeError } from '../catalogos-error.util';
import type { Bloque, Salon, TipoSilleteria } from '../catalogos.models';
import { SalonesService } from './salones.service';

/**
 * Diálogo de creación/edición de `Salon` (`nombre`, `bloque_id`,
 * `tipo_silleteria_id`, `cantidad_sillas`, `cantidad_mesas` — ver
 * `SalonIn`/`SalonPatch` en back/catalogos/controller.py). Modo
 * creación/edición determinado por si `salon()` es `null` o no.
 *
 * `bloques`/`tiposSilleteria` se reciben como input en vez de inyectar
 * `BloquesService`/`TiposSilleteriaService` directamente acá: el
 * componente padre (`SalonesListComponent`) ya los tiene cargados para la
 * tabla, evitando una segunda suscripción redundante a la misma query.
 */
@Component({
  selector: 'app-salon-form-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, InputTextModule, InputNumberModule, SelectModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      [header]="salon() ? 'Editar salón' : 'Nuevo salón'"
      [modal]="true"
      [style]="{ width: '28rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="salon-form-dialog__form">
        <div class="salon-form-dialog__campo">
          <label for="salon-nombre">Nombre</label>
          <input pInputText id="salon-nombre" formControlName="nombre" />
        </div>

        <div class="salon-form-dialog__campo">
          <label for="salon-bloque">Bloque</label>
          <p-select
            id="salon-bloque"
            formControlName="bloque_id"
            [options]="bloques()"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Selecciona un bloque"
          />
        </div>

        <div class="salon-form-dialog__campo">
          <label for="salon-tipo-silleteria">Tipo de silletería</label>
          <p-select
            id="salon-tipo-silleteria"
            formControlName="tipo_silleteria_id"
            [options]="tiposSilleteria()"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Selecciona un tipo de silletería"
          />
        </div>

        <div class="salon-form-dialog__campo">
          <label for="salon-cantidad-sillas">Cantidad de sillas</label>
          <p-inputnumber id="salon-cantidad-sillas" formControlName="cantidad_sillas" />
        </div>

        <div class="salon-form-dialog__campo">
          <label for="salon-cantidad-mesas">Cantidad de mesas</label>
          <p-inputnumber id="salon-cantidad-mesas" formControlName="cantidad_mesas" />
        </div>

        <footer class="salon-form-dialog__acciones">
          <p-button type="button" label="Cancelar" severity="secondary" [text]="true" (onClick)="cancelar()" />
          <p-button type="submit" label="Guardar" [loading]="guardando()" [disabled]="form.invalid" />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
    .salon-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .salon-form-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .salon-form-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class SalonFormDialogComponent {
  readonly visible = model(false);
  readonly salon = input<Salon | null>(null);
  readonly bloques = input<Bloque[]>([]);
  readonly tiposSilleteria = input<TipoSilleteria[]>([]);
  readonly guardado = output<void>();

  private readonly salonesService = inject(SalonesService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    bloque_id: ['', Validators.required],
    tipo_silleteria_id: ['', Validators.required],
    cantidad_sillas: [0, [Validators.required, Validators.min(0)]],
    cantidad_mesas: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly guardando = computed(
    () => this.salonesService.crear.isPending() || this.salonesService.actualizar.isPending(),
  );

  constructor() {
    // Repuebla el formulario cada vez que cambia el salón a editar (o se
    // vuelve a `null` para modo creación) — el mismo diálogo se reutiliza
    // para crear y editar, ver `SalonesListComponent`.
    effect(() => {
      const salonActual = this.salon();
      if (salonActual) {
        this.form.setValue({
          nombre: salonActual.nombre,
          bloque_id: salonActual.bloque_id,
          tipo_silleteria_id: salonActual.tipo_silleteria_id,
          cantidad_sillas: salonActual.cantidad_sillas,
          cantidad_mesas: salonActual.cantidad_mesas,
        });
      } else {
        this.form.reset({
          nombre: '',
          bloque_id: '',
          tipo_silleteria_id: '',
          cantidad_sillas: 0,
          cantidad_mesas: 0,
        });
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    const salonActual = this.salon();

    const onSuccess = () => {
      this.visible.set(false);
      this.guardado.emit();
      this.messageService.add({
        severity: 'success',
        summary: salonActual ? 'Salón actualizado' : 'Salón creado',
      });
    };
    const onError = (error: unknown) =>
      this.messageService.add({
        severity: 'error',
        summary: salonActual ? 'No se pudo actualizar el salón' : 'No se pudo crear el salón',
        detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
      });

    if (salonActual) {
      this.salonesService.actualizar.mutate({ id: salonActual.id, ...valores }, { onSuccess, onError });
    } else {
      this.salonesService.crear.mutate(valores, { onSuccess, onError });
    }
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
