import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';

import { extraerMensajeError } from './prestamos-error.util';
import { PrestamosLookupsService } from './prestamos-lookups.service';
import { PrestamosService } from './prestamos.service';

/**
 * Diálogo de registro de un PRÉSTAMO de equipos (`POST /api/prestamos/`,
 * schema `PrestamoIn` — ver back/prestamos/controller.py). Es el único
 * "crear" de la feature: no existe modo edición, porque el backend no expone
 * PATCH sobre préstamos.
 *
 * Los 4 campos de `PrestamoIn` son todos requeridos. Los tres primeros son
 * FKs elegidas con `p-select`; el cuarto, `equipo_ids`, es un
 * `p-multiselect` porque un préstamo entrega N equipos de una sola vez.
 *
 * Nota de diseño — "al menos un equipo" es la ÚNICA regla del backend que se
 * anticipa acá, y no por duplicar la validación sino porque enviar una lista
 * vacía no es un error del usuario que valga un viaje al servidor: es un
 * formulario a medio llenar. Se implementa con `Validators.required` +
 * `Validators.minLength(1)` sobre el control de lista, lo que deja el botón
 * de envío deshabilitado mientras no haya selección.
 *
 * Las demás reglas NO se replican: no se pre-filtran los equipos por
 * disponibilidad (no hay endpoint que la informe, ver
 * prestamos-error.util.ts) ni se bloquea la ubicación sin
 * `permite_prestamo_equipos` — esas ubicaciones solo quedan de últimas en el
 * selector (ver `PrestamosLookupsService.ubicacionesPrestamo`) y el 400 del
 * backend se muestra tal cual.
 */
@Component({
  selector: 'app-prestamo-form-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, SelectModule, MultiSelectModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Registrar préstamo"
      [modal]="true"
      [style]="{ width: '32rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="prestamo-form-dialog__form">
        <div class="prestamo-form-dialog__campo">
          <label for="prestamo-solicitante">Solicitante</label>
          <p-select
            id="prestamo-solicitante"
            formControlName="solicitante_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona quién solicita el préstamo"
          />
        </div>

        <div class="prestamo-form-dialog__campo">
          <label for="prestamo-prestamista">Usuario que presta</label>
          <p-select
            id="prestamo-prestamista"
            formControlName="usuario_prestamista_id"
            [options]="lookups.opcionesUsuarios()"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona quién entrega los equipos"
          />
        </div>

        <div class="prestamo-form-dialog__campo">
          <label for="prestamo-ubicacion">Ubicación</label>
          <p-select
            id="prestamo-ubicacion"
            formControlName="ubicacion_id"
            [options]="lookups.ubicacionesPrestamo()"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Selecciona la ubicación"
          />
        </div>

        <div class="prestamo-form-dialog__campo">
          <label for="prestamo-equipos">Equipos</label>
          <p-multiselect
            id="prestamo-equipos"
            formControlName="equipo_ids"
            [options]="lookups.opcionesEquipos()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            display="chip"
            placeholder="Selecciona al menos un equipo"
          />
        </div>

        <footer class="prestamo-form-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Registrar préstamo"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
    .prestamo-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .prestamo-form-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .prestamo-form-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class PrestamoFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(PrestamosLookupsService);
  private readonly prestamosService = inject(PrestamosService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  // Los tres ids son `string` (`''` = "sin seleccionar", que
  // `Validators.required` rechaza). `equipo_ids` es una lista: para un array,
  // `Validators.required` ya considera vacío `[]`, y `minLength(1)` deja
  // explícito en el propio formulario el "al menos un equipo" del backend.
  protected readonly form = this.fb.nonNullable.group({
    solicitante_id: ['', Validators.required],
    usuario_prestamista_id: ['', Validators.required],
    ubicacion_id: ['', Validators.required],
    equipo_ids: this.fb.nonNullable.control<string[]>(
      [],
      [Validators.required, Validators.minLength(1)],
    ),
  });

  protected readonly guardando = computed(() => this.prestamosService.crear.isPending());

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();

    this.prestamosService.crear.mutate(
      {
        solicitante_id: valores.solicitante_id,
        usuario_prestamista_id: valores.usuario_prestamista_id,
        ubicacion_id: valores.ubicacion_id,
        equipo_ids: valores.equipo_ids,
      },
      {
        onSuccess: () => {
          this.visible.set(false);
          this.form.reset({
            solicitante_id: '',
            usuario_prestamista_id: '',
            ubicacion_id: '',
            equipo_ids: [],
          });
          this.guardado.emit();
          this.messageService.add({ severity: 'success', summary: 'Préstamo registrado' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo registrar el préstamo',
            detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
          }),
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
