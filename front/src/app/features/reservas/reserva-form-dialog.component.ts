import { Component, computed, effect, inject, model, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './reservas-error.util';
import { ReservaAgendaDisponibilidadComponent } from './reserva-agenda-disponibilidad.component';
import { ReservaDisponibilidadService } from './reserva-disponibilidad.service';
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
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    ReservaAgendaDisponibilidadComponent,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (keydown.escape)="cancelar()">
        <div class="dialogo__panel" role="dialog" aria-modal="true" aria-label="Registrar reserva">
          <h2 mat-dialog-title>Registrar reserva</h2>
          <mat-dialog-content>
            <div class="reserva-form-dialog__layout">
              <form [formGroup]="form" (ngSubmit)="guardar()" class="reserva-form-dialog__form">
                <mat-form-field appearance="outline">
                  <mat-label>Solicitante</mat-label>
                  <input
                    type="text"
                    matInput
                    id="reserva-solicitante"
                    formControlName="solicitante_id"
                    [matAutocomplete]="autoSolicitante"
                    placeholder="Busca quién solicita la reserva (por documento o nombre)"
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

                <!-- TODO: entrega_llave_momento no existe en ReservaIndividualIn
                     (ver back/reservas/controller.py) -- este toggle es SOLO de UI
                     por ahora (no se envía en el payload). Si se agrega el campo al
                     backend, incluirlo en guardar() sin más cambios de UI. -->
                <mat-checkbox [(ngModel)]="entregaLlaveAlMomento" [ngModelOptions]="{ standalone: true }">
                  Entrega de llave al momento
                </mat-checkbox>

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

              <app-reserva-agenda-disponibilidad
                [salonSeleccionado]="!!form.controls.salon_id.value && !!form.controls.fecha.value"
                [cargando]="disponibilidadService.agenda.isPending()"
                [ocupaciones]="disponibilidadService.agenda.data()?.ocupaciones ?? []"
                [rangoSeleccionadoMin]="rangoSeleccionadoMin()"
                (slotElegido)="onSlotElegido($event)"
              />
            </div>
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
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-elevated, 0 10px 40px rgba(0, 0, 0, 0.2));
      width: 56rem;
      max-width: 95vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4, 1rem);
    }

    .reserva-form-dialog__layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
      gap: var(--space-4, 1rem);
      align-items: start;
    }

    @media (max-width: 720px) {
      .reserva-form-dialog__layout {
        grid-template-columns: 1fr;
      }
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
  protected readonly disponibilidadService = inject(ReservaDisponibilidadService);
  private readonly reservasService = inject(ReservasService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  /** UI-only, ver el TODO junto al `mat-checkbox` en el template. */
  protected entregaLlaveAlMomento = false;

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

  // Refleja los valores del formulario reactivo como signals para alimentar
  // el panel de agenda (`ReservaDisponibilidadService` es reactivo a
  // signals, no a `FormGroup.valueChanges` directamente).
  private readonly salonIdValue = toSignal(this.form.controls.salon_id.valueChanges, {
    initialValue: this.form.controls.salon_id.value,
  });
  private readonly fechaValue = toSignal(this.form.controls.fecha.valueChanges, {
    initialValue: this.form.controls.fecha.value,
  });
  private readonly horaInicioValue = toSignal(this.form.controls.hora_inicio.valueChanges, {
    initialValue: this.form.controls.hora_inicio.value,
  });
  private readonly horaFinValue = toSignal(this.form.controls.hora_fin.valueChanges, {
    initialValue: this.form.controls.hora_fin.value,
  });

  /** Rango horario elegido actualmente, en minutos desde medianoche (para
   * pintar "seleccionado" en el panel de agenda). `null` mientras falte
   * alguna de las dos horas. */
  protected readonly rangoSeleccionadoMin = computed(() => {
    const inicio = this.horaInicioValue();
    const fin = this.horaFinValue();
    if (!inicio || !fin) {
      return null;
    }
    return {
      inicio: inicio.getHours() * 60 + inicio.getMinutes(),
      fin: fin.getHours() * 60 + fin.getMinutes(),
    };
  });

  constructor() {
    // Alimenta `ReservaDisponibilidadService` con salón+fecha del propio
    // formulario en curso — ver el docblock de `ReservaAgendaDisponibilidadComponent`.
    effect(() => {
      this.disponibilidadService.salonId.set(this.salonIdValue() || null);
      const fecha = this.fechaValue();
      this.disponibilidadService.fecha.set(fecha ? aFechaIso(fecha) : null);
    });
  }

  /** Clic en un slot libre del panel de agenda: prellena hora_inicio/hora_fin
   * combinando la fecha ya elegida con la hora del slot (mismo criterio de
   * componentes LOCALES que el resto del diálogo, ver docblock de arriba). */
  protected onSlotElegido(rango: { inicioMin: number; finMin: number }): void {
    const fecha = this.form.controls.fecha.value;
    if (!fecha) {
      return;
    }
    const horaInicio = new Date(fecha);
    horaInicio.setHours(Math.floor(rango.inicioMin / 60), rango.inicioMin % 60, 0, 0);
    const horaFin = new Date(fecha);
    horaFin.setHours(Math.floor(rango.finMin / 60), rango.finMin % 60, 0, 0);
    this.form.patchValue({ hora_inicio: horaInicio, hora_fin: horaFin });
  }

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
        this.entregaLlaveAlMomento = false;
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
