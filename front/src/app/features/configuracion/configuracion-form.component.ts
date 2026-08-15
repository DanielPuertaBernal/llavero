import { Component, computed, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './configuracion-error.util';
import { ConfiguracionLookupsService } from './configuracion-lookups.service';
import { ConfiguracionService } from './configuracion.service';
import type { ConfiguracionInput } from './configuracion.models';

/**
 * Vista de configuración global: un formulario de EDICIÓN de una única fila
 * que siempre existe (ver la nota de alcance en `configuracion.models.ts`).
 * A diferencia de todas las demás features, no hay lista ni modo creación —
 * solo `GET /api/configuracion/` para precargar y `PUT /api/configuracion/`
 * para guardar los 5 campos completos.
 *
 * Nota de diseño — el formulario arranca deshabilitado mientras
 * `configuracion.isPending()`: no tiene sentido dejar editar campos sobre
 * valores por defecto que todavía no se sabe si son los reales. El `effect`
 * de más abajo precarga los 5 controles apenas llega la respuesta.
 *
 * Nota de diseño — `plantilla_recordatorio` es `string | null` en el
 * contrato pero el control de formulario usa siempre `string` (`''` para
 * "sin plantilla"): es el mismo criterio que el resto de esta app usa para
 * campos de texto opcionales (ver `ReservaFormDialogComponent.motivo`), y
 * `guardar()` convierte `''` de vuelta a `null` al armar el payload.
 *
 * Nota de arquitectura — el toast de éxito/error usa el `NotificationService`
 * global (`providedIn: 'root'`), igual que el resto de la app tras la
 * migración de PrimeNG a Angular Material + SweetAlert2: ya no hace falta
 * proveer nada a nivel de componente.
 */
@Component({
  selector: 'app-configuracion-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <h1>Configuración</h1>

    @if (configuracionService.configuracion.isPending()) {
      <p>Cargando configuración...</p>
    } @else if (configuracionService.configuracion.isError()) {
      <p role="alert">No se pudo cargar la configuración. Intenta de nuevo.</p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="guardar()" class="configuracion-form__form">
        <mat-form-field appearance="outline">
          <mat-label>Minutos antes de considerar una llave en mora</mat-label>
          <input matInput type="number" id="configuracion-limite-mora" formControlName="limite_antes_mora_minutos" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Máximo de reintentos de recordatorio</mat-label>
          <input
            matInput
            type="number"
            id="configuracion-max-reintentos"
            formControlName="max_reintentos_recordatorio"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Minutos antes de considerar una reserva no reclamada</mat-label>
          <input
            matInput
            type="number"
            id="configuracion-limite-no-reclamada"
            formControlName="limite_no_reclamada_minutos"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Plantilla de recordatorio (opcional)</mat-label>
          <textarea
            matInput
            id="configuracion-plantilla"
            formControlName="plantilla_recordatorio"
            rows="4"
            placeholder="Déjalo en blanco para no usar una plantilla por defecto"
          ></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Ubicación por defecto</mat-label>
          <mat-select id="configuracion-ubicacion-defecto" formControlName="ubicacion_defecto_id">
            @for (opcion of lookups.opcionesUbicaciones(); track opcion.value) {
              <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <footer class="configuracion-form__acciones">
          <button type="submit" mat-raised-button color="primary" [disabled]="form.invalid || guardando()">
            @if (guardando()) {
              <mat-spinner diameter="18" />
            } @else {
              Guardar
            }
          </button>
        </footer>
      </form>
    }
  `,
  styles: `
    .configuracion-form__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-4);
      max-width: 32rem;
    }

    .configuracion-form__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class ConfiguracionFormComponent {
  protected readonly lookups = inject(ConfiguracionLookupsService);
  protected readonly configuracionService = inject(ConfiguracionService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    limite_antes_mora_minutos: [0, [Validators.required, Validators.min(0)]],
    max_reintentos_recordatorio: [0, [Validators.required, Validators.min(0)]],
    plantilla_recordatorio: [''],
    ubicacion_defecto_id: ['', Validators.required],
    limite_no_reclamada_minutos: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly guardando = computed(() => this.configuracionService.actualizar.isPending());

  constructor() {
    // Precarga los 5 controles apenas llega la respuesta del GET. No hay
    // rama "sin datos" que restaurar a default: a diferencia de un diálogo
    // de creación/edición, acá siempre hay una fila que editar.
    effect(() => {
      const configuracion = this.configuracionService.configuracion.data();
      if (configuracion) {
        this.form.setValue({
          limite_antes_mora_minutos: configuracion.limite_antes_mora_minutos,
          max_reintentos_recordatorio: configuracion.max_reintentos_recordatorio,
          plantilla_recordatorio: configuracion.plantilla_recordatorio ?? '',
          ubicacion_defecto_id: configuracion.ubicacion_defecto_id,
          limite_no_reclamada_minutos: configuracion.limite_no_reclamada_minutos,
        });
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }

    const valores = this.form.getRawValue();
    const payload: ConfiguracionInput = {
      ubicacion_defecto_id: valores.ubicacion_defecto_id,
      limite_antes_mora_minutos: valores.limite_antes_mora_minutos,
      max_reintentos_recordatorio: valores.max_reintentos_recordatorio,
      plantilla_recordatorio: valores.plantilla_recordatorio ? valores.plantilla_recordatorio : null,
      limite_no_reclamada_minutos: valores.limite_no_reclamada_minutos,
    };

    this.configuracionService.actualizar.mutate(payload, {
      onSuccess: () => this.notificationService.success('Configuración actualizada'),
      onError: (error) =>
        this.notificationService.error(
          'No se pudo actualizar la configuración',
          extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        ),
    });
  }
}
