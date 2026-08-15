import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { NotificationService } from '../../../core/shared/notification.service';
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
 *
 * Migrado de PrimeNG (`p-dialog`) a Angular Material: se mantiene el mismo
 * patrón de visibilidad (`model<boolean>`) para no romper la API pública
 * del componente (`app-ubicacion-form-dialog [(visible)]="..."` en
 * `ubicaciones-list.component.ts`); la implementación interna usa las
 * directivas reales de `MatDialogModule` dentro de un overlay condicional,
 * mismo criterio que `SalonFormDialogComponent`.
 */
@Component({
  selector: 'app-ubicacion-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (click)="cancelar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ubicacion-form-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="ubicacion-form-titulo">
            {{ ubicacion() ? 'Editar ubicación' : 'Nueva ubicación' }}
          </h2>

          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="ubicacion-form-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Nombre</mat-label>
                <input matInput id="ubicacion-nombre" formControlName="nombre" />
              </mat-form-field>

              <mat-checkbox formControlName="permite_prestamo_llaves" id="ubicacion-prestamo-llaves">
                Permite préstamo de llaves
              </mat-checkbox>

              <mat-checkbox formControlName="permite_devolucion_llaves" id="ubicacion-devolucion-llaves">
                Permite devolución de llaves
              </mat-checkbox>

              <mat-checkbox formControlName="permite_prestamo_equipos" id="ubicacion-prestamo-equipos">
                Permite préstamo de equipos
              </mat-checkbox>
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
                Guardar
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
      width: 28rem;
      max-width: 92vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4);
    }

    .ubicacion-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
  `,
})
export class UbicacionFormDialogComponent {
  readonly visible = model(false);
  readonly ubicacion = input<Ubicacion | null>(null);
  readonly guardado = output<void>();

  private readonly ubicacionesService = inject(UbicacionesService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
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
      this.notificationService.success(ubicacionActual ? 'Ubicación actualizada' : 'Ubicación creada');
    };
    const onError = (error: unknown) =>
      this.notificationService.error(
        ubicacionActual ? 'No se pudo actualizar la ubicación' : 'No se pudo crear la ubicación',
        extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
      );

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
