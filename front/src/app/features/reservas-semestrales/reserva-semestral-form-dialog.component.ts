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
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './reservas-semestrales-error.util';
import { ReservasSemestralesLookupsService } from './reservas-semestrales-lookups.service';
import { ReservasSemestralesService } from './reservas-semestrales.service';
import { OPCIONES_DIA_SEMANA, type FranjaInput, type GrupoReservaSemestralInput } from './reservas-semestrales.models';

/**
 * Diálogo de registro de un GRUPO de reserva semestral
 * (`POST /api/reservas-semestrales/`, schema `GrupoReservaSemestralIn` — ver
 * back/reservas_semestrales/controller.py). Es el único "crear" de la
 * feature: no existe modo edición, porque el backend no expone PATCH.
 *
 * Nota de dominio — diferencia clave con `ReservaFormDialogComponent`
 * (feature hermana): ese formulario registra UNA franja de UN día. Este
 * registra un GRUPO de N franjas (día + hora_inicio + hora_fin) que comparten
 * salón, solicitante y semestre, y que el backend guarda con un único
 * `grupo_id` — por eso acá hay un `FormArray` de franjas en vez de tres
 * controles sueltos de fecha/hora, y el `POST` se dispara UNA sola vez con
 * todas juntas (ver la nota de diseño de `ReservasSemestralesService.crear`).
 *
 * Nota de UX — agregar/quitar franja: arranca con una fila de franja (el caso
 * más común, una sola franja semanal) y el botón "Agregar franja" añade
 * filas para el caso de varias franjas por semestre (ej. lunes y miércoles).
 * Se exige al menos una franja SIEMPRE — `quitarFranja` es un no-op sobre la
 * última fila en vez de permitir un grupo vacío, porque
 * `GrupoReservaSemestralIn.franjas` no acepta lista vacía en el backend
 * (sería un grupo sin ninguna franja, que no tiene sentido) y prevenirlo acá
 * evita un 400 evitable para el caso más común.
 *
 * Nota de diseño — `hora_inicio`/`hora_fin` de cada franja se serializan
 * desde los componentes LOCALES del `Date` que produce `mat-timepicker`,
 * nunca con `toISOString()`: son horas RECURRENTES sin fecha ni zona (`time`
 * en el schema) — mismo criterio (y misma razón, UTC-5 en Colombia) que
 * `ReservaFormDialogComponent.aHoraIso`.
 *
 * Ninguna regla de negocio se replica acá: que las tres FKs existan, y sobre
 * todo el SOLAPAMIENTO con otra reserva semestral o con una `Programacion`
 * ya programada son todas del backend. El 400 se muestra tal cual (ver
 * reservas-semestrales-error.util.ts).
 *
 * Excepción puntual — `hora_inicio < hora_fin` SÍ se valida acá, por franja
 * (`horaFinPosteriorAHoraInicio` en `crearFranjaControl`), pero es una
 * validación de FORMA pura de cliente (¿la franja tiene sentido como rango?),
 * no la de solapamiento: no necesita estado del servidor y evita un 400 obvio
 * antes de enviar.
 *
 * Nota de alcance — no hay control para `creado_manualmente`: el schema del
 * backend le da default `true`, y este formulario es la única vía HUMANA de
 * creación (una carga institucional con `creado_manualmente=false` no pasa
 * por esta UI). Se omite del payload y el backend aplica su propio default.
 *
 * Migración PrimeNG -> Angular Material: `p-dialog` -> panel propio con las
 * directivas reales de `MatDialogModule`; `p-select` de solicitante ->
 * `mat-autocomplete` (lista de personas potencialmente larga, igual criterio
 * que `reserva-form-dialog`); `p-select` de salón/semestre/día -> `mat-select`
 * (listas acotadas); `p-datepicker[timeOnly]` -> `MatTimepickerModule`;
 * `MessageService` -> `NotificationService`.
 */
@Component({
  selector: 'app-reserva-semestral-form-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatTimepickerModule,
    MatIconModule,
    MatButtonModule,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (keydown.escape)="cancelar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Registrar reserva semestral"
        >
          <h2 mat-dialog-title>Registrar reserva semestral</h2>
          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="reserva-semestral-form-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Solicitante</mat-label>
                <input
                  type="text"
                  matInput
                  id="rs-solicitante"
                  formControlName="solicitante_id"
                  [matAutocomplete]="autoSolicitante"
                  placeholder="Busca quién solicita la reserva"
                />
                <mat-autocomplete #autoSolicitante="matAutocomplete" [displayWith]="etiquetaPersona">
                  @for (opcion of lookups.opcionesPersonas(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Salón</mat-label>
                <mat-select id="rs-salon" formControlName="salon_id" placeholder="Selecciona el salón">
                  @for (salon of lookups.listaSalones(); track salon.id) {
                    <mat-option [value]="salon.id">{{ salon.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Semestre</mat-label>
                <mat-select id="rs-semestre" formControlName="semestre_id" placeholder="Selecciona el semestre">
                  @for (opcion of lookups.opcionesSemestres(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <fieldset formArrayName="franjas" class="reserva-semestral-form-dialog__franjas">
                <legend>Franjas horarias</legend>

                @for (franjaControl of franjasArray.controls; track franjaControl; let i = $index) {
                  <div [formGroupName]="i" class="reserva-semestral-form-dialog__franja">
                    <mat-form-field appearance="outline">
                      <mat-label>Día</mat-label>
                      <mat-select
                        [id]="'rs-franja-dia-' + i"
                        formControlName="dia"
                        [attr.aria-label]="'Día de la franja ' + (i + 1)"
                      >
                        @for (opcion of opcionesDia; track opcion.value) {
                          <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Hora inicio</mat-label>
                      <input
                        matInput
                        [id]="'rs-franja-inicio-' + i"
                        formControlName="hora_inicio"
                        [matTimepicker]="pickerInicio"
                        [attr.aria-label]="'Hora de inicio de la franja ' + (i + 1)"
                      />
                      <mat-timepicker-toggle matIconSuffix [for]="pickerInicio" />
                      <mat-timepicker #pickerInicio interval="15m" />
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Hora fin</mat-label>
                      <input
                        matInput
                        [id]="'rs-franja-fin-' + i"
                        formControlName="hora_fin"
                        [matTimepicker]="pickerFin"
                        [attr.aria-label]="'Hora de fin de la franja ' + (i + 1)"
                      />
                      <mat-timepicker-toggle matIconSuffix [for]="pickerFin" />
                      <mat-timepicker #pickerFin interval="15m" />
                    </mat-form-field>

                    <button
                      mat-icon-button
                      type="button"
                      color="warn"
                      [disabled]="franjasArray.length === 1"
                      (click)="quitarFranja(i)"
                      [attr.aria-label]="'Quitar franja ' + (i + 1)"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>

                    @if (franjaControl.errors?.['horaFinAntesQueInicio']) {
                      <small class="reserva-semestral-form-dialog__error">
                        La hora de fin debe ser posterior a la hora de inicio.
                      </small>
                    }
                  </div>
                }

                <button mat-button type="button" (click)="agregarFranja()">
                  <mat-icon>add</mat-icon>
                  Agregar franja
                </button>
              </fieldset>

              <mat-dialog-actions align="end">
                <button mat-button type="button" (click)="cancelar()">Cancelar</button>
                <button
                  mat-raised-button
                  color="primary"
                  type="submit"
                  [disabled]="form.invalid || guardando()"
                >
                  {{ guardando() ? 'Registrando...' : 'Registrar grupo' }}
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
      width: 38rem;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4, 1rem);
    }

    .reserva-semestral-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4, 1rem);
    }

    .reserva-semestral-form-dialog__franjas {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-4, 1rem);
      margin: 0;
      border: 1px solid #e2e5e4;
      border-radius: 6px;
    }

    .reserva-semestral-form-dialog__franjas legend {
      padding: 0 var(--space-2, 0.5rem);
      color: #6b7280;
      font-size: 0.75rem;
    }

    .reserva-semestral-form-dialog__franja {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }
  `,
})
export class ReservaSemestralFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(ReservasSemestralesLookupsService);
  private readonly reservasSemestralesService = inject(ReservasSemestralesService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesDia = OPCIONES_DIA_SEMANA;

  // Los dos ids son `string` (`''` = "sin seleccionar", que
  // `Validators.required` rechaza). `franjas` es un `FormArray` porque el
  // grupo puede tener varias (ver la nota de dominio del docblock).
  protected readonly form = this.fb.nonNullable.group({
    salon_id: ['', Validators.required],
    solicitante_id: ['', Validators.required],
    semestre_id: ['', Validators.required],
    franjas: this.fb.array([this.crearFranjaControl()]),
  });

  protected get franjasArray() {
    return this.form.controls.franjas;
  }

  protected readonly guardando = computed(() => this.reservasSemestralesService.crear.isPending());

  protected readonly etiquetaPersona = (personaId: string): string =>
    this.lookups.opcionesPersonas().find((opcion) => opcion.value === personaId)?.label ?? '';

  private crearFranjaControl() {
    return this.fb.nonNullable.group(
      {
        dia: ['', Validators.required],
        hora_inicio: this.fb.nonNullable.control<Date | null>(null, Validators.required),
        hora_fin: this.fb.nonNullable.control<Date | null>(null, Validators.required),
      },
      { validators: horaFinPosteriorAHoraInicio },
    );
  }

  protected agregarFranja(): void {
    this.franjasArray.push(this.crearFranjaControl());
  }

  /** No-op sobre la última fila: el grupo siempre necesita al menos una
   * franja (ver la nota de UX del docblock). */
  protected quitarFranja(indice: number): void {
    if (this.franjasArray.length === 1) {
      return;
    }
    this.franjasArray.removeAt(indice);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();

    const franjas: FranjaInput[] = valores.franjas.map((franja) => ({
      // El `Validators.required` de cada control (más el `this.form.invalid`
      // de arriba) respalda estos `!`: acá ya no pueden ser `''`/`null`.
      dia: franja.dia as FranjaInput['dia'],
      hora_inicio: aHoraIso(franja.hora_inicio as Date),
      hora_fin: aHoraIso(franja.hora_fin as Date),
    }));

    const payload: GrupoReservaSemestralInput = {
      salon_id: valores.salon_id,
      solicitante_id: valores.solicitante_id,
      semestre_id: valores.semestre_id,
      franjas,
    };

    this.reservasSemestralesService.crear.mutate(payload, {
      onSuccess: () => {
        this.visible.set(false);
        this.resetearFormulario();
        this.guardado.emit();
        this.notificationService.success('Reserva semestral registrada');
      },
      onError: (error) =>
        this.notificationService.error(
          'No se pudo registrar la reserva semestral',
          extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        ),
    });
  }

  private resetearFormulario(): void {
    this.form.reset({ salon_id: '', solicitante_id: '', semestre_id: '' });
    // Vuelve a dejar exactamente una franja en blanco (arrancar sin ninguna
    // dejaría el formulario inválido de entrada en el próximo registro).
    while (this.franjasArray.length > 1) {
      this.franjasArray.removeAt(0);
    }
    this.franjasArray.at(0)?.reset({ dia: '', hora_inicio: null, hora_fin: null });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
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
