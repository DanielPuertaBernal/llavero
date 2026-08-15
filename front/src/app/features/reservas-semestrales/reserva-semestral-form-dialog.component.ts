import { Component, computed, inject, model, output } from '@angular/core';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';

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
 * desde los componentes LOCALES del `Date` que produce `p-datepicker`
 * (`timeOnly`), nunca con `toISOString()`: son horas RECURRENTES sin fecha ni
 * zona (`time` en el schema) — mismo criterio (y misma razón, UTC-5 en
 * Colombia) que `ReservaFormDialogComponent.aHoraIso`.
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
 */
@Component({
  selector: 'app-reserva-semestral-form-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, SelectModule, DatePickerModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Registrar reserva semestral"
      [modal]="true"
      [style]="{ width: '38rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="reserva-semestral-form-dialog__form">
        <div class="reserva-semestral-form-dialog__campo">
          <label for="rs-solicitante">Solicitante</label>
          <p-select
            id="rs-solicitante"
            formControlName="solicitante_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona quién solicita la reserva"
          />
        </div>

        <div class="reserva-semestral-form-dialog__campo">
          <label for="rs-salon">Salón</label>
          <p-select
            id="rs-salon"
            formControlName="salon_id"
            [options]="lookups.listaSalones()"
            optionLabel="nombre"
            optionValue="id"
            [filter]="true"
            filterBy="nombre"
            placeholder="Selecciona el salón"
          />
        </div>

        <div class="reserva-semestral-form-dialog__campo">
          <label for="rs-semestre">Semestre</label>
          <p-select
            id="rs-semestre"
            formControlName="semestre_id"
            [options]="lookups.opcionesSemestres()"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona el semestre"
          />
        </div>

        <fieldset formArrayName="franjas" class="reserva-semestral-form-dialog__franjas">
          <legend>Franjas horarias</legend>

          @for (franja of franjasArray.controls; track franja; let i = $index) {
            <div [formGroupName]="i" class="reserva-semestral-form-dialog__franja">
              <p-select
                [id]="'rs-franja-dia-' + i"
                formControlName="dia"
                [options]="opcionesDia"
                optionLabel="label"
                optionValue="value"
                [ariaLabel]="'Día de la franja ' + (i + 1)"
                placeholder="Día"
              />
              <p-datepicker
                [inputId]="'rs-franja-inicio-' + i"
                formControlName="hora_inicio"
                [timeOnly]="true"
                hourFormat="24"
                placeholder="HH:MM"
                [ariaLabel]="'Hora de inicio de la franja ' + (i + 1)"
              />
              <p-datepicker
                [inputId]="'rs-franja-fin-' + i"
                formControlName="hora_fin"
                [timeOnly]="true"
                hourFormat="24"
                placeholder="HH:MM"
                [ariaLabel]="'Hora de fin de la franja ' + (i + 1)"
              />
              <p-button
                type="button"
                icon="pi pi-trash"
                severity="danger"
                [text]="true"
                [disabled]="franjasArray.length === 1"
                (onClick)="quitarFranja(i)"
                [ariaLabel]="'Quitar franja ' + (i + 1)"
              />
              @if (franja.errors?.['horaFinAntesQueInicio']) {
                <small class="reserva-semestral-form-dialog__error">
                  La hora de fin debe ser posterior a la hora de inicio.
                </small>
              }
            </div>
          }

          <p-button
            type="button"
            label="Agregar franja"
            icon="pi pi-plus"
            [text]="true"
            (onClick)="agregarFranja()"
          />
        </fieldset>

        <footer class="reserva-semestral-form-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Registrar grupo"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
    .reserva-semestral-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .reserva-semestral-form-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .reserva-semestral-form-dialog__franjas {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-4);
      margin: 0;
    }

    .reserva-semestral-form-dialog__franjas legend {
      padding: 0 var(--space-2);
    }

    .reserva-semestral-form-dialog__franja {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .reserva-semestral-form-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class ReservaSemestralFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(ReservasSemestralesLookupsService);
  private readonly reservasSemestralesService = inject(ReservasSemestralesService);
  private readonly messageService = inject(MessageService);
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
        this.messageService.add({ severity: 'success', summary: 'Reserva semestral registrada' });
      },
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo registrar la reserva semestral',
          detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        }),
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
