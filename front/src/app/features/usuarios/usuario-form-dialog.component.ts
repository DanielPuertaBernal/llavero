import { Component, computed, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { extraerMensajeError } from './usuarios-error.util';
import { UsuariosLookupsService } from './usuarios-lookups.service';
import { UsuariosService } from './usuarios.service';

/**
 * Diálogo de creación de `Usuario` (`POST /api/usuarios/`, schema
 * `UsuarioIn` — ver back/usuarios/controller.py).
 *
 * Nota de alcance — este diálogo es SOLO de creación, y por eso no recibe
 * un `input<Usuario | null>` como sus equivalentes de `catalogos`: el
 * backend no expone PATCH sobre usuarios (ni ningún otro camino de
 * edición), así que un modo "editar" sería una promesa que la API no puede
 * cumplir. Corregir el nombre, el correo, el rol o la ubicación de un
 * usuario ya creado no es una operación que exista hoy en el dominio; si
 * algún día el backend agrega el endpoint, este diálogo se amplía entonces.
 *
 * Los 5 campos son exactamente los de `UsuarioIn`. `rol_id` y
 * `ubicacion_id` se eligen con un `p-select` alimentado por
 * `UsuariosLookupsService`, nunca pegando un UUID a mano.
 *
 * Nota de diseño — validación: `Validators.email` es una comprobación de
 * FORMA (que el texto parezca un correo), no una regla de negocio. La
 * unicidad del `email_institucional` la impone la base de datos y NO se
 * pre-chequea acá con una consulta extra; si el correo ya existe, el
 * backend responde con su mensaje y se muestra tal cual (ver
 * usuarios-error.util.ts). Que el `rol_id`/`ubicacion_id` existan tampoco
 * se revalida: los selectores ya solo ofrecen ids del propio catálogo, y el
 * backend es la autoridad final.
 */
@Component({
  selector: 'app-usuario-form-dialog',
  standalone: true,
  imports: [
    DialogModule,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    CheckboxModule,
    ButtonModule,
  ],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Nuevo usuario"
      [modal]="true"
      [style]="{ width: '30rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="usuario-form-dialog__form">
        <div class="usuario-form-dialog__campo">
          <label for="usuario-nombre">Nombre</label>
          <input pInputText id="usuario-nombre" formControlName="nombre" />
        </div>

        <div class="usuario-form-dialog__campo">
          <label for="usuario-email">Correo institucional</label>
          <input
            pInputText
            id="usuario-email"
            type="email"
            formControlName="email_institucional"
            placeholder="nombre@uco.edu.co"
          />
        </div>

        <div class="usuario-form-dialog__campo">
          <label for="usuario-rol">Rol</label>
          <p-select
            id="usuario-rol"
            formControlName="rol_id"
            [options]="lookups.opcionesRoles()"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona un rol"
          />
        </div>

        <div class="usuario-form-dialog__campo">
          <label for="usuario-ubicacion">Ubicación</label>
          <p-select
            id="usuario-ubicacion"
            formControlName="ubicacion_id"
            [options]="lookups.opcionesUbicaciones()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona una ubicación"
          />
        </div>

        <div class="usuario-form-dialog__campo usuario-form-dialog__checkbox">
          <p-checkbox formControlName="activo" [binary]="true" inputId="usuario-activo" />
          <label for="usuario-activo">Usuario activo</label>
        </div>

        <footer class="usuario-form-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Crear usuario"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
})
export class UsuarioFormDialogComponent {
  readonly visible = model(false);
  readonly guardado = output<void>();

  protected readonly lookups = inject(UsuariosLookupsService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  // `rol_id`/`ubicacion_id` son UUID, así que viajan como `string`: `''`
  // representa "sin seleccionar" y `Validators.required` lo rechaza.
  // `activo` arranca en `true` — el default del propio schema del backend
  // (`activo: bool = True`), porque crear un usuario ya desactivado es la
  // excepción, no lo normal.
  protected readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    email_institucional: ['', [Validators.required, Validators.email]],
    rol_id: ['', Validators.required],
    ubicacion_id: ['', Validators.required],
    activo: [true],
  });

  protected readonly guardando = computed(() => this.usuariosService.crear.isPending());

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }

    this.usuariosService.crear.mutate(this.form.getRawValue(), {
      onSuccess: () => {
        this.visible.set(false);
        this.form.reset();
        this.guardado.emit();
        this.messageService.add({ severity: 'success', summary: 'Usuario creado' });
      },
      // El diálogo NO se cierra ante un error: el operador necesita ver el
      // mensaje del backend junto a los datos que escribió para corregirlos
      // (típicamente, un correo institucional ya tomado).
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo crear el usuario',
          detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        }),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
