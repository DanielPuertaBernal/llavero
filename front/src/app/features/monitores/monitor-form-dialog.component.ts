import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { extraerMensajeError } from './monitores-error.util';
import { MonitoresLookupsService } from './monitores-lookups.service';
import { MonitoresService } from './monitores.service';
import { OPCIONES_DIA_SEMANA, type DiaSemana, type MonitorInput } from './monitores.models';

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
 * Nota de diseño — los dos `p-select` de persona (`docente_titular_id` y
 * `monitor_delegado_id`) reusan la MISMA lista de opciones
 * (`lookups.opcionesPersonas()`, ver `MonitoresLookupsService`): son dos
 * roles distintos sobre la misma entidad `Comunidad`, no dos catálogos
 * distintos — cualquier persona puede aparecer en cualquiera de los dos
 * selectores, el backend no restringe por tipo de persona.
 *
 * Ninguna regla de negocio se replica acá: que `docente_titular_id` y
 * `monitor_delegado_id` existan en `comunidad` y sean personas DISTINTAS
 * (`domain.validar_docente_distinto_de_monitor`) lo decide el backend, y su
 * 400 se muestra tal cual (ver monitores-error.util.ts) — el formulario NO
 * compara los dos selectores entre sí antes de enviar.
 */
@Component({
  selector: 'app-monitor-form-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, InputTextModule, SelectModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Nueva monitoría"
      [modal]="true"
      [style]="{ width: '30rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="monitor-form-dialog__form">
        <div class="monitor-form-dialog__campo">
          <label for="monitor-docente-titular">Docente titular</label>
          <p-select
            id="monitor-docente-titular"
            formControlName="docente_titular_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona el docente titular"
          />
        </div>

        <div class="monitor-form-dialog__campo">
          <label for="monitor-monitor-delegado">Monitor delegado</label>
          <p-select
            id="monitor-monitor-delegado"
            formControlName="monitor_delegado_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona el monitor delegado"
          />
        </div>

        <div class="monitor-form-dialog__campo">
          <label for="monitor-materia">Materia</label>
          <input pInputText id="monitor-materia" formControlName="materia" />
        </div>

        <div class="monitor-form-dialog__campo">
          <label for="monitor-aula">Aula (opcional)</label>
          <input pInputText id="monitor-aula" formControlName="aula" />
        </div>

        <div class="monitor-form-dialog__campo">
          <label for="monitor-dia">Día (opcional)</label>
          <p-select
            id="monitor-dia"
            formControlName="dia"
            [options]="opcionesDia"
            optionLabel="label"
            optionValue="value"
            placeholder="Cualquier día con clase"
            [showClear]="true"
          />
        </div>

        <div class="monitor-form-dialog__campo">
          <label for="monitor-horario">Horario (opcional)</label>
          <input
            pInputText
            id="monitor-horario"
            formControlName="horario"
            placeholder="Ej. 14:00 - 16:00"
          />
        </div>

        <footer class="monitor-form-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Crear monitoría"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
})
export class MonitorFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(MonitoresLookupsService);
  private readonly monitoresService = inject(MonitoresService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesDia = OPCIONES_DIA_SEMANA;

  // Los dos ids de persona son `string` (`''` = "sin seleccionar", que
  // `Validators.required` rechaza). `aula`/`horario` arrancan en `''` y se
  // omiten del payload si quedan en blanco; `dia` arranca en `null` (mismo
  // significado: "sin elegir") y se omite igual.
  protected readonly form = this.fb.nonNullable.group({
    docente_titular_id: ['', Validators.required],
    monitor_delegado_id: ['', Validators.required],
    materia: ['', Validators.required],
    aula: [''],
    dia: this.fb.nonNullable.control<DiaSemana | null>(null),
    horario: [''],
  });

  protected readonly guardando = computed(() => this.monitoresService.crear.isPending());

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
        this.messageService.add({ severity: 'success', summary: 'Monitoría creada' });
      },
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo crear la monitoría',
          detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        }),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
