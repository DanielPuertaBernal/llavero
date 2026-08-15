import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../core/shared/notification.service';
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
 * FKs elegidas con `mat-select`; el cuarto, `equipo_ids`, es un `mat-select
 * [multiple]` porque un préstamo entrega N equipos de una sola vez.
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
 *
 * Migrado de PrimeNG (`p-dialog`) a Angular Material: mismo patrón de
 * visibilidad (`model<boolean>`), implementación interna con las directivas
 * de `MatDialogModule` dentro de un overlay condicional (ver
 * `llave-entrega-dialog.component.ts` para la misma decisión). El
 * `p-multiselect` con chips se simplifica a un `mat-select [multiple]`
 * simple: Material no trae un modo "chip" nativo para `mat-select` y no
 * aporta reimplementarlo a mano acá.
 */
@Component({
  selector: 'app-prestamo-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
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
          aria-labelledby="prestamo-form-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="prestamo-form-titulo">Registrar préstamo</h2>

          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="prestamo-form-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Solicitante</mat-label>
                <mat-select
                  id="prestamo-solicitante"
                  formControlName="solicitante_id"
                  placeholder="Selecciona quién solicita el préstamo"
                >
                  @for (persona of lookups.opcionesPersonas(); track persona.value) {
                    <mat-option [value]="persona.value">{{ persona.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Usuario que presta</mat-label>
                <mat-select
                  id="prestamo-prestamista"
                  formControlName="usuario_prestamista_id"
                  placeholder="Selecciona quién entrega los equipos"
                >
                  @for (usuario of lookups.opcionesUsuarios(); track usuario.value) {
                    <mat-option [value]="usuario.value">{{ usuario.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ubicación</mat-label>
                <mat-select
                  id="prestamo-ubicacion"
                  formControlName="ubicacion_id"
                  placeholder="Selecciona la ubicación"
                >
                  @for (ubicacion of lookups.ubicacionesPrestamo(); track ubicacion.id) {
                    <mat-option [value]="ubicacion.id">{{ ubicacion.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Equipos</mat-label>
                <mat-select
                  id="prestamo-equipos"
                  formControlName="equipo_ids"
                  multiple
                  placeholder="Selecciona al menos un equipo"
                >
                  @for (equipo of lookups.opcionesEquipos(); track equipo.value) {
                    <mat-option [value]="equipo.value">{{ equipo.label }}</mat-option>
                  }
                </mat-select>
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
                Registrar préstamo
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
      width: 32rem;
      max-width: 92vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4);
    }

    .prestamo-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class PrestamoFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(PrestamosLookupsService);
  private readonly prestamosService = inject(PrestamosService);
  private readonly notificationService = inject(NotificationService);
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
          this.notificationService.success('Préstamo registrado');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo registrar el préstamo',
            extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
          ),
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
