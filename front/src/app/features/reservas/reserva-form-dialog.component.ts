import { Component, computed, inject, model, output } from '@angular/core';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './reservas-error.util';
import { ReservasLookupsService } from './reservas-lookups.service';
import { ReservasService } from './reservas.service';
import type { ReservaInput } from './reservas.models';

/**
 * Diálogo de registro de una RESERVA INDIVIDUAL (`POST /api/reservas/`,
 * schema `ReservaIndividualIn` — ver back/reservas/controller.py). Es el
 * único "crear" de la feature: no existe modo edición, porque el backend no
 * expone PATCH sobre reservas.
 *
 * De los 6 campos de `ReservaIndividualIn`, 5 son requeridos y `motivo` es
 * opcional de verdad (`str | None = None`): cuando el operador lo deja vacío,
 * la clave se OMITE del payload en vez de mandar `''` — la columna es
 * NULL-able y una cadena vacía es un motivo vacío guardado, no "sin motivo".
 *
 * Nota de diseño — fecha y horas se serializan desde los componentes LOCALES
 * del `Date` que produce `mat-datepicker`/`mat-timepicker`, nunca con
 * `toISOString()`. `fecha`, `hora_inicio` y `hora_fin` son de calendario
 * (`date`/`time` en el schema, sin zona): `toISOString()` los convertiría a
 * UTC y en Colombia (UTC-5) mandaría el día anterior y las horas corridas 5
 * posiciones.
 *
 * Ninguna regla de negocio se replica acá: que el salón y el solicitante
 * existan, y sobre todo el SOLAPAMIENTO con otra reserva ya aprobada son
 * todas del backend. La lista cargada en el navegador puede estar
 * desactualizada frente a otra pestaña, así que un chequeo cliente sería una
 * adivinanza. El 400 se muestra tal cual (ver reservas-error.util.ts).
 *
 * Excepción puntual — `hora_inicio < hora_fin` SÍ se valida acá
 * (`horaFinPosteriorAHoraInicio`), pero es una validación de FORMA pura de
 * cliente (¿la franja tiene sentido como rango?), no la de solapamiento: no
 * necesita estado del servidor y evita un 400 obvio antes de que el operador
 * llegue a enviar el formulario.
 *
 * Migración PrimeNG -> Angular Material: `p-dialog` -> panel propio con las
 * directivas reales de `MatDialogModule` (`mat-dialog-title`,
 * `mat-dialog-content`, `mat-dialog-actions`) montado sobre el mismo patrón
 * `model(visible)` que ya exponía el componente (no se convirtió a
 * `MatDialog.open()` para no romper el `[(visible)]` que usa
 * `reservas-list`). `p-select` de solicitante -> `mat-autocomplete` (la
 * lista de personas de la comunidad puede ser larga, y `[filter]` de PrimeNG
 * cumplía ese rol); `p-select` de salón -> `mat-select` (lista acotada).
 * `p-datepicker` -> `MatDatepickerModule` + `MatTimepickerModule` (el
 * calendario de disponibilidad compartido que menciona el diseño táctico).
 * `MessageService` -> `NotificationService`.
 */
@Component({
  selector: 'app-reserva-form-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatInputModule,
    MatButtonModule,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (keydown.escape)="cancelar()">
        <div class="dialogo__panel" role="dialog" aria-modal="true" aria-label="Registrar reserva">
          <h2 mat-dialog-title>Registrar reserva</h2>
          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="reserva-form-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Solicitante</mat-label>
                <input
                  type="text"
                  matInput
                  id="reserva-solicitante"
                  formControlName="solicitante_id"
                  [matAutocomplete]="autoSolicitante"
                  placeholder="Busca quién solicita la reserva"
                />
                <mat-autocomplete
                  #autoSolicitante="matAutocomplete"
                  [displayWith]="etiquetaPersona"
                >
                  @for (opcion of lookups.opcionesPersonas(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Salón</mat-label>
                <mat-select id="reserva-salon" formControlName="salon_id" placeholder="Selecciona el salón">
                  @for (salon of lookups.listaSalones(); track salon.id) {
                    <mat-option [value]="salon.id">{{ salon.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Fecha</mat-label>
                <input matInput id="reserva-fecha" formControlName="fecha" [matDatepicker]="pickerFecha" />
                <mat-datepicker-toggle matIconSuffix [for]="pickerFecha" />
                <mat-datepicker #pickerFecha />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Hora de inicio</mat-label>
                <input
                  matInput
                  id="reserva-hora-inicio"
                  formControlName="hora_inicio"
                  [matTimepicker]="pickerInicio"
                />
                <mat-timepicker-toggle matIconSuffix [for]="pickerInicio" />
                <mat-timepicker #pickerInicio interval="15m" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Hora de fin</mat-label>
                <input
                  matInput
                  id="reserva-hora-fin"
                  formControlName="hora_fin"
                  [matTimepicker]="pickerFin"
                />
                <mat-timepicker-toggle matIconSuffix [for]="pickerFin" />
                <mat-timepicker #pickerFin interval="15m" />
                @if (form.errors?.['horaFinAntesQueInicio']) {
                  <mat-error>La hora de fin debe ser posterior a la hora de inicio.</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Motivo (opcional)</mat-label>
                <textarea
                  matInput
                  id="reserva-motivo"
                  formControlName="motivo"
                  rows="2"
                  placeholder="Para qué se usará el salón"
                ></textarea>
              </mat-form-field>

              <mat-dialog-actions align="end">
                <button mat-button type="button" (click)="cancelar()">Cancelar</button>
                <button
                  mat-raised-button
                  color="primary"
                  type="submit"
                  [disabled]="form.invalid || guardando()"
                >
                  {{ guardando() ? 'Registrando...' : 'Registrar reserva' }}
                </button>
              </mat-dialog-actions>
            </form>
          </mat-dialog-content>
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
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 32rem;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4, 1rem);
    }

    .reserva-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 0.5rem);
    }
  `,
})
export class ReservaFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(ReservasLookupsService);
  private readonly reservasService = inject(ReservasService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  // Los dos ids son `string` (`''` = "sin seleccionar", que
  // `Validators.required` rechaza). Fecha y horas son `Date | null` porque eso
  // es lo que `mat-datepicker`/`mat-timepicker` escriben en el control; `null`
  // = sin elegir. `motivo` arranca en `''` y se omite del payload si queda en
  // blanco.
  protected readonly form = this.fb.nonNullable.group(
    {
      salon_id: ['', Validators.required],
      solicitante_id: ['', Validators.required],
      fecha: this.fb.nonNullable.control<Date | null>(null, Validators.required),
      hora_inicio: this.fb.nonNullable.control<Date | null>(null, Validators.required),
      hora_fin: this.fb.nonNullable.control<Date | null>(null, Validators.required),
      motivo: ['', Validators.maxLength(255)],
    },
    { validators: horaFinPosteriorAHoraInicio },
  );

  protected readonly guardando = computed(() => this.reservasService.crear.isPending());

  protected readonly etiquetaPersona = (personaId: string): string =>
    this.lookups.opcionesPersonas().find((opcion) => opcion.value === personaId)?.label ?? '';

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    // Los tres `!` los respalda el `Validators.required` de cada control más
    // el `this.form.invalid` de arriba: acá ya no pueden ser `null`.
    const fecha = valores.fecha as Date;
    const horaInicio = valores.hora_inicio as Date;
    const horaFin = valores.hora_fin as Date;
    const motivo = valores.motivo.trim();

    const payload: ReservaInput = {
      salon_id: valores.salon_id,
      solicitante_id: valores.solicitante_id,
      fecha: aFechaIso(fecha),
      hora_inicio: aHoraIso(horaInicio),
      hora_fin: aHoraIso(horaFin),
      // Ver la nota de diseño del docblock: la clave ni siquiera aparece
      // cuando el operador no escribió un motivo.
      ...(motivo ? { motivo } : {}),
    };

    this.reservasService.crear.mutate(payload, {
      onSuccess: () => {
        this.visible.set(false);
        this.form.reset({
          salon_id: '',
          solicitante_id: '',
          fecha: null,
          hora_inicio: null,
          hora_fin: null,
          motivo: '',
        });
        this.guardado.emit();
        this.notificationService.success('Reserva registrada');
      },
      onError: (error) =>
        this.notificationService.error(
          'No se pudo registrar la reserva',
          extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        ),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}

/** `Date` -> `YYYY-MM-DD` tomando los componentes LOCALES (ver la nota de
 * diseño del componente: `toISOString()` desplazaría el día). */
function aFechaIso(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** `Date` -> `HH:MM:SS` local. Los segundos van siempre en `00`: la franja se
 * elige con granularidad de minutos, y `datetime.time` los espera igual. */
function aHoraIso(hora: Date): string {
  return `${dosDigitos(hora.getHours())}:${dosDigitos(hora.getMinutes())}:00`;
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** Cross-field validator de FORMA pura (ver la nota del docblock del
 * componente): solo exige que la franja tenga sentido como rango cuando
 * ambas horas están elegidas. No repite la regla de SOLAPAMIENTO, que
 * necesita estado del servidor y sigue siendo del backend. */
function horaFinPosteriorAHoraInicio(control: AbstractControl): ValidationErrors | null {
  const horaInicio = control.get('hora_inicio')?.value as Date | null;
  const horaFin = control.get('hora_fin')?.value as Date | null;
  if (!horaInicio || !horaFin) {
    return null;
  }
  return horaFin > horaInicio ? null : { horaFinAntesQueInicio: true };
}
