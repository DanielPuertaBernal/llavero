import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './monitores-error.util';
import { MonitoresLookupsService } from './monitores-lookups.service';
import { MonitoresService } from './monitores.service';
import { OPCIONES_DIA_SEMANA, type DiaSemana, type MonitorInput } from './monitores.models';

/** `HH:MM - HH:MM` en 24 horas (00-23 / 00-59), separador " - " como sugiere
 * el placeholder. Solo valida forma, no que la hora de inicio sea menor a la
 * de fin (ver la nota del docblock del componente). */
const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d - ([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Diálogo de registro de una MONITORÍA (`POST /api/monitores/`, schema
 * `MonitorIn` — ver back/monitores/controller.py). Es el único "crear" de la
 * feature: no existe modo edición, porque el backend no expone PATCH sobre
 * monitores (a diferencia de `UsuarioFormDialogComponent`, que sí tiene un
 * modo edición porque `usuarios` sí tiene PATCH).
 *
 * De los 6 campos de `MonitorIn`, 3 son requeridos (`docente_titular_id`,
 * `monitor_delegado_id`, `materia`) y 3 son opcionales de verdad
 * (`aula`, `dia`, `horario`, todos `str | None = None`/`DiaSemana | None` en
 * el schema): cuando el operador los deja vacíos, la clave se OMITE del
 * payload en vez de mandar `''`/`null` — mismo criterio que `motivo` en
 * `ReservaFormDialogComponent`.
 *
 * Nota de diseño — los dos autocompletados de persona (`docente_titular_id` y
 * `monitor_delegado_id`) reusan la MISMA lista de opciones
 * (`lookups.opcionesPersonas()`, ver `MonitoresLookupsService`): son dos
 * roles distintos sobre la misma entidad `Comunidad`, no dos catálogos
 * distintos — cualquier persona puede aparecer en cualquiera de los dos
 * selectores, el backend no restringe por tipo de persona. Se usa
 * `mat-autocomplete` (no `mat-select`) porque la comunidad universitaria
 * puede tener cientos de personas: es el caso real de búsqueda de persona que
 * `[filter]` de PrimeNG cumplía.
 *
 * Ninguna regla de negocio se replica acá: que `docente_titular_id` y
 * `monitor_delegado_id` existan en `comunidad` y sean personas DISTINTAS
 * (`domain.validar_docente_distinto_de_monitor`) lo decide el backend, y su
 * 400 se muestra tal cual (ver monitores-error.util.ts) — el formulario NO
 * compara los dos selectores entre sí antes de enviar.
 *
 * Nota — `horario` es texto libre en el backend (`str | None`, sin
 * estructura), pero el placeholder sugiere un formato ("Ej. 14:00 - 16:00")
 * que el `Validators.pattern` de acá exige cuando el campo no está vacío:
 * valida la FORMA (`HH:MM - HH:MM`, 24 horas) para atajar errores de tipeo
 * obvios antes de guardar; no compara que la hora de inicio sea menor a la
 * de fin porque el campo ni siquiera son dos controles reales, es un solo
 * string libre.
 *
 * Migración PrimeNG -> Angular Material: `p-dialog` -> panel propio con las
 * directivas reales de `MatDialogModule`; `p-select` de persona ->
 * `mat-autocomplete` (ver nota de diseño arriba); `p-select` de día ->
 * `mat-select`; `p-inputtext` -> `matInput`; `MessageService` ->
 * `NotificationService`.
 */
@Component({
  selector: 'app-monitor-form-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonModule,
  ],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (keydown.escape)="cancelar()">
        <div class="dialogo__panel" role="dialog" aria-modal="true" aria-label="Nueva monitoría">
          <h2 mat-dialog-title>Nueva monitoría</h2>
          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="monitor-form-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Docente titular</mat-label>
                <input
                  type="text"
                  matInput
                  id="monitor-docente-titular"
                  formControlName="docente_titular_id"
                  [matAutocomplete]="autoDocente"
                  placeholder="Busca el docente titular"
                />
                <mat-autocomplete #autoDocente="matAutocomplete" [displayWith]="etiquetaPersona">
                  @for (opcion of lookups.opcionesPersonas(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Monitor delegado</mat-label>
                <input
                  type="text"
                  matInput
                  id="monitor-monitor-delegado"
                  formControlName="monitor_delegado_id"
                  [matAutocomplete]="autoDelegado"
                  placeholder="Busca el monitor delegado"
                />
                <mat-autocomplete #autoDelegado="matAutocomplete" [displayWith]="etiquetaPersona">
                  @for (opcion of lookups.opcionesPersonas(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Materia</mat-label>
                <input matInput id="monitor-materia" formControlName="materia" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Aula (opcional)</mat-label>
                <input matInput id="monitor-aula" formControlName="aula" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Día (opcional)</mat-label>
                <mat-select id="monitor-dia" formControlName="dia" placeholder="Cualquier día con clase">
                  <mat-option [value]="null">Cualquier día con clase</mat-option>
                  @for (opcion of opcionesDia; track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Horario (opcional)</mat-label>
                <input
                  matInput
                  id="monitor-horario"
                  formControlName="horario"
                  placeholder="Ej. 14:00 - 16:00"
                />
                @if (form.controls.horario.errors?.['pattern']) {
                  <mat-error>Formato esperado: HH:MM - HH:MM, en 24 horas (ej. 14:00 - 16:00).</mat-error>
                }
              </mat-form-field>

              <mat-dialog-actions align="end">
                <button mat-button type="button" (click)="cancelar()">Cancelar</button>
                <button
                  mat-raised-button
                  color="primary"
                  type="submit"
                  [disabled]="form.invalid || guardando()"
                >
                  {{ guardando() ? 'Creando...' : 'Crear monitoría' }}
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
      width: 30rem;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4, 1rem);
    }

    .monitor-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 0.5rem);
    }
  `,
})
export class MonitorFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(MonitoresLookupsService);
  private readonly monitoresService = inject(MonitoresService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesDia = OPCIONES_DIA_SEMANA;

  // Los dos ids de persona son `string` (`''` = "sin seleccionar", que
  // `Validators.required` rechaza). `aula`/`horario` arrancan en `''` y se
  // omiten del payload si quedan en blanco; `dia` arranca en `null` (mismo
  // significado: "sin elegir") y se omite igual.
  protected readonly form = this.fb.nonNullable.group({
    docente_titular_id: ['', Validators.required],
    monitor_delegado_id: ['', Validators.required],
    materia: ['', [Validators.required, Validators.maxLength(150)]],
    aula: ['', Validators.maxLength(30)],
    dia: this.fb.nonNullable.control<DiaSemana | null>(null),
    horario: ['', [Validators.maxLength(30), Validators.pattern(HORARIO_REGEX)]],
  });

  protected readonly guardando = computed(() => this.monitoresService.crear.isPending());

  protected readonly etiquetaPersona = (personaId: string): string =>
    this.lookups.opcionesPersonas().find((opcion) => opcion.value === personaId)?.label ?? '';

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    const aula = valores.aula.trim();
    const horario = valores.horario.trim();

    const payload: MonitorInput = {
      docente_titular_id: valores.docente_titular_id,
      monitor_delegado_id: valores.monitor_delegado_id,
      materia: valores.materia,
      // Ver la nota de diseño del docblock: las claves ni siquiera aparecen
      // cuando el operador no completó el campo opcional.
      ...(aula ? { aula } : {}),
      ...(valores.dia ? { dia: valores.dia } : {}),
      ...(horario ? { horario } : {}),
    };

    this.monitoresService.crear.mutate(payload, {
      onSuccess: () => {
        this.visible.set(false);
        this.form.reset({
          docente_titular_id: '',
          monitor_delegado_id: '',
          materia: '',
          aula: '',
          dia: null,
          horario: '',
        });
        this.guardado.emit();
        this.notificationService.success('Monitoría creada');
      },
      onError: (error) =>
        this.notificationService.error(
          'No se pudo crear la monitoría',
          extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        ),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
