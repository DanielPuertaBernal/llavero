import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

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
 * del `Date` que produce `p-datepicker`, nunca con `toISOString()`. `fecha`,
 * `hora_inicio` y `hora_fin` son de calendario (`date`/`time` en el schema,
 * sin zona): `toISOString()` los convertiría a UTC y en Colombia (UTC-5)
 * mandaría el día anterior y las horas corridas 5 posiciones.
 *
 * Ninguna regla de negocio se replica acá: que la franja sea válida
 * (`hora_inicio < hora_fin`), que el salón y el solicitante existan, y sobre
 * todo el SOLAPAMIENTO con otra reserva ya aprobada son todas del backend.
 * La lista cargada en el navegador puede estar desactualizada frente a otra
 * pestaña, así que un chequeo cliente sería una adivinanza. El 400 se muestra
 * tal cual (ver reservas-error.util.ts).
 */
@Component({
  selector: 'app-reserva-form-dialog',
  standalone: true,
  imports: [
    DialogModule,
    ReactiveFormsModule,
    SelectModule,
    DatePickerModule,
    TextareaModule,
    ButtonModule,
  ],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Registrar reserva"
      [modal]="true"
      [style]="{ width: '32rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="reserva-form-dialog__form">
        <div class="reserva-form-dialog__campo">
          <label for="reserva-solicitante">Solicitante</label>
          <p-select
            id="reserva-solicitante"
            formControlName="solicitante_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona quién solicita la reserva"
          />
        </div>

        <div class="reserva-form-dialog__campo">
          <label for="reserva-salon">Salón</label>
          <p-select
            id="reserva-salon"
            formControlName="salon_id"
            [options]="lookups.listaSalones()"
            optionLabel="nombre"
            optionValue="id"
            [filter]="true"
            filterBy="nombre"
            placeholder="Selecciona el salón"
          />
        </div>

        <div class="reserva-form-dialog__campo">
          <label for="reserva-fecha">Fecha</label>
          <p-datepicker
            inputId="reserva-fecha"
            formControlName="fecha"
            dateFormat="dd/mm/yy"
            [showIcon]="true"
            placeholder="Selecciona la fecha"
          />
        </div>

        <div class="reserva-form-dialog__campo">
          <label for="reserva-hora-inicio">Hora de inicio</label>
          <p-datepicker
            inputId="reserva-hora-inicio"
            formControlName="hora_inicio"
            [timeOnly]="true"
            hourFormat="24"
            placeholder="HH:MM"
          />
        </div>

        <div class="reserva-form-dialog__campo">
          <label for="reserva-hora-fin">Hora de fin</label>
          <p-datepicker
            inputId="reserva-hora-fin"
            formControlName="hora_fin"
            [timeOnly]="true"
            hourFormat="24"
            placeholder="HH:MM"
          />
        </div>

        <div class="reserva-form-dialog__campo">
          <label for="reserva-motivo">Motivo (opcional)</label>
          <textarea
            pTextarea
            id="reserva-motivo"
            formControlName="motivo"
            rows="2"
            placeholder="Para qué se usará el salón"
          ></textarea>
        </div>

        <footer class="reserva-form-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Registrar reserva"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
    .reserva-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .reserva-form-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .reserva-form-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class ReservaFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(ReservasLookupsService);
  private readonly reservasService = inject(ReservasService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  // Los dos ids son `string` (`''` = "sin seleccionar", que
  // `Validators.required` rechaza). Fecha y horas son `Date | null` porque eso
  // es lo que `p-datepicker` escribe en el control; `null` = sin elegir.
  // `motivo` arranca en `''` y se omite del payload si queda en blanco.
  protected readonly form = this.fb.nonNullable.group({
    salon_id: ['', Validators.required],
    solicitante_id: ['', Validators.required],
    fecha: this.fb.nonNullable.control<Date | null>(null, Validators.required),
    hora_inicio: this.fb.nonNullable.control<Date | null>(null, Validators.required),
    hora_fin: this.fb.nonNullable.control<Date | null>(null, Validators.required),
    motivo: [''],
  });

  protected readonly guardando = computed(() => this.reservasService.crear.isPending());

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
        this.messageService.add({ severity: 'success', summary: 'Reserva registrada' });
      },
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo registrar la reserva',
          detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        }),
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
