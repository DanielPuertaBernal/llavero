import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../../core/shared/notification.service';
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
 *
 * Migrado de PrimeNG (`p-dialog`) a Angular Material: se mantiene el mismo
 * patrón de visibilidad (`model<boolean>`) para no romper la API pública
 * del componente (`app-salon-form-dialog [(visible)]="..."` en
 * `salones-list.component.ts`); la implementación interna usa las
 * directivas reales de `MatDialogModule` (`mat-dialog-title`/
 * `mat-dialog-content`/`mat-dialog-actions`) dentro de un overlay
 * condicional, mismo criterio que `LlaveEntregaDialogComponent`.
 */
@Component({
  selector: 'app-salon-form-dialog',
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
          aria-labelledby="salon-form-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="salon-form-titulo">
            {{ salon() ? 'Editar salón' : 'Nuevo salón' }}
          </h2>

          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="salon-form-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Nombre</mat-label>
                <input matInput id="salon-nombre" formControlName="nombre" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Bloque</mat-label>
                <mat-select id="salon-bloque" formControlName="bloque_id" placeholder="Selecciona un bloque">
                  @for (bloque of bloques(); track bloque.id) {
                    <mat-option [value]="bloque.id">{{ bloque.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Tipo de silletería</mat-label>
                <mat-select
                  id="salon-tipo-silleteria"
                  formControlName="tipo_silleteria_id"
                  placeholder="Selecciona un tipo de silletería"
                >
                  @for (tipo of tiposSilleteria(); track tipo.id) {
                    <mat-option [value]="tipo.id">{{ tipo.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Cantidad de sillas</mat-label>
                <input matInput type="number" id="salon-cantidad-sillas" formControlName="cantidad_sillas" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Cantidad de mesas</mat-label>
                <input matInput type="number" id="salon-cantidad-mesas" formControlName="cantidad_mesas" />
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

    .salon-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
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
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(30)]],
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
      this.notificationService.success(salonActual ? 'Salón actualizado' : 'Salón creado');
    };
    const onError = (error: unknown) =>
      this.notificationService.error(
        salonActual ? 'No se pudo actualizar el salón' : 'No se pudo crear el salón',
        extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
      );

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
