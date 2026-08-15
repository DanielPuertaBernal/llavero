import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './novedades-error.util';
import { NovedadesService } from './novedades.service';
import { OPCIONES_CATEGORIA_NOVEDAD, type CategoriaNovedad } from './novedades.models';

/**
 * Diálogo de creación de `Novedad` (`POST /api/novedades/` con el schema
 * `NovedadIn` — ver back/novedades/controller.py).
 *
 * A diferencia de `UsuarioFormDialogComponent`/`ReservaFormDialogComponent`,
 * este diálogo es SOLO de creación: el backend no expone PATCH sobre
 * novedades, así que no hay modo edición ni una entrada `novedad`.
 *
 * Nota de diseño — el quid de este componente: `registrado_por_id` NO se le
 * pide al operador en un selector. Sale de `AuthService.currentUser().id`,
 * mismo patrón que `UsuariosListComponent.desactivar` toma
 * `usuario_actual_id` de la sesión activa en vez de un campo del formulario
 * — es el mismo dato ("quién está operando"), la misma fuente. El caso "sin
 * sesión" también se replica idéntico: si `currentUser()` es `null`, la
 * creación NO se despacha y se muestra un toast de error, en vez de mandar
 * un request con `registrado_por_id` ausente que el schema rechazaría con un
 * error de validación mucho menos claro.
 *
 * Nota de diseño — `categoria` se elige con un `mat-select` alimentado por
 * `OPCIONES_CATEGORIA_NOVEDAD` (derivado de `CategoriaNovedad`, ver
 * novedades.models.ts), nunca escribiendo el valor a mano. `descripcion` es
 * el único campo opcional (`str | None = None` en `NovedadIn`): se OMITE del
 * payload cuando el operador no escribe nada, en vez de mandar `''` — mismo
 * criterio que `motivo` en `ReservaInput`.
 *
 * Nota de diseño — validación: el formulario no replica ninguna regla de
 * negocio del backend (que `registrado_por_id` exista en usuarios, ver
 * `service.crear_novedad`). Ese id lo fija la sesión, no un selector con ids
 * inventables, así que la única forma de que el 400 ocurra es una sesión
 * cuyo usuario fue borrado entretanto — un caso de carrera que el backend
 * sigue siendo la autoridad para rechazar (ver novedades-error.util.ts).
 *
 * Migración PrimeNG → Angular Material: el `visible` model input se
 * mantiene igual (renderizado inline en `novedades-list.component.ts`), solo
 * cambia el componente concreto del overlay/panel, ahora con las directivas
 * de `MatDialogModule` sobre los estilos literales de "Diálogo/modal" de la
 * especificación visual UCO. `MessageService.add(...)` se reemplaza por
 * `NotificationService`.
 */
@Component({
  selector: 'app-novedad-form-dialog',
  standalone: true,
  imports: [MatDialogModule, ReactiveFormsModule, MatSelectModule, MatInputModule, MatButtonModule, MatFormFieldModule],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (click)="cancelar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Nueva novedad"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title>Nueva novedad</h2>

          <form [formGroup]="form" (ngSubmit)="guardar()" class="novedad-form-dialog__form">
            <mat-dialog-content>
              <mat-form-field appearance="outline" class="novedad-form-dialog__campo">
                <mat-label>Categoría</mat-label>
                <mat-select formControlName="categoria" placeholder="Selecciona una categoría">
                  @for (opcion of opcionesCategoria; track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="novedad-form-dialog__campo">
                <mat-label>Descripción</mat-label>
                <textarea
                  matInput
                  formControlName="descripcion"
                  rows="4"
                  placeholder="Opcional: detalla el incidente"
                ></textarea>
              </mat-form-field>
            </mat-dialog-content>

            <mat-dialog-actions align="end">
              <button mat-stroked-button type="button" (click)="cancelar()">Cancelar</button>
              <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || guardando()">
                {{ guardando() ? 'Registrando…' : 'Registrar novedad' }}
              </button>
            </mat-dialog-actions>
          </form>
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
      box-shadow: 0 8px 24px rgba(26, 26, 26, 0.2);
      width: 30rem;
      max-width: calc(100vw - var(--space-4) * 2);
      padding: var(--space-4);
    }

    .novedad-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .novedad-form-dialog__campo {
      width: 100%;
    }
  `,
})
export class NovedadFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly opcionesCategoria = OPCIONES_CATEGORIA_NOVEDAD;

  private readonly authService = inject(AuthService);
  private readonly novedadesService = inject(NovedadesService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    categoria: ['', Validators.required],
    descripcion: [''],
  });

  protected readonly guardando = computed(() => this.novedadesService.crear.isPending());

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }

    const usuarioActual = this.authService.currentUser();
    if (!usuarioActual) {
      // Sin id de operador no se despacha nada: el backend necesita
      // `registrado_por_id` para validar que el usuario exista.
      this.notificationService.error(
        'No se pudo crear la novedad',
        'No hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.',
      );
      return;
    }

    const { categoria, descripcion } = this.form.getRawValue();

    this.novedadesService.crear.mutate(
      {
        categoria: categoria as CategoriaNovedad,
        registrado_por_id: usuarioActual.id,
        ...(descripcion ? { descripcion } : {}),
      },
      {
        onSuccess: () => {
          this.visible.set(false);
          this.form.reset();
          this.guardado.emit();
          this.notificationService.success('Novedad registrada');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo crear la novedad',
            extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
          ),
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
