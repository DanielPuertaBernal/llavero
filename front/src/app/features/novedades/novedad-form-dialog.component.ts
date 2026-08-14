import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { AuthService } from '../../core/auth/auth.service';
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
 * Nota de diseño — `categoria` se elige con un `p-select` alimentado por
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
 */
@Component({
  selector: 'app-novedad-form-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, SelectModule, TextareaModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Nueva novedad"
      [modal]="true"
      [style]="{ width: '30rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="novedad-form-dialog__form">
        <div class="novedad-form-dialog__campo">
          <label for="novedad-categoria">Categoría</label>
          <p-select
            id="novedad-categoria"
            formControlName="categoria"
            [options]="opcionesCategoria"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona una categoría"
          />
        </div>

        <div class="novedad-form-dialog__campo">
          <label for="novedad-descripcion">Descripción</label>
          <textarea
            id="novedad-descripcion"
            pTextarea
            formControlName="descripcion"
            rows="4"
            placeholder="Opcional: detalla el incidente"
          ></textarea>
        </div>

        <footer class="novedad-form-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Registrar novedad"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
})
export class NovedadFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly opcionesCategoria = OPCIONES_CATEGORIA_NOVEDAD;

  private readonly authService = inject(AuthService);
  private readonly novedadesService = inject(NovedadesService);
  private readonly messageService = inject(MessageService);
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
      this.messageService.add({
        severity: 'error',
        summary: 'No se pudo crear la novedad',
        detail: 'No hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.',
      });
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
          this.messageService.add({ severity: 'success', summary: 'Novedad registrada' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo crear la novedad',
            detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
          }),
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
