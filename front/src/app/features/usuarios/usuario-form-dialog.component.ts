import { Component, computed, effect, inject, input, model, output } from '@angular/core';
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
import type { Usuario } from './usuarios.models';

/**
 * Mensaje por defecto de la EDICIÓN. Existe como constante para dejar
 * explícito por qué es tan específico: el backend no valida la unicidad de
 * `email_institucional` en Python, deja propagar el error de Postgres y eso
 * llega como 500 sin `{detail}` — así que `extraerMensajeError` cae acá
 * justo en el caso más común de fallo al editar. Nombrar la causa probable
 * es la única pista útil que le queda al operador.
 */
const MENSAJE_FALLBACK_EDICION =
  'Verifica los datos e intenta de nuevo. Es posible que el correo institucional ya esté en uso por otro usuario.';

/**
 * Diálogo de creación y edición de `Usuario` (`POST /api/usuarios/` con el
 * schema `UsuarioIn`, `PATCH /api/usuarios/{id}` con `UsuarioPatch` — ver
 * back/usuarios/controller.py).
 *
 * El modo lo decide la entrada `usuario`: `null` es creación, un `Usuario`
 * es edición (mismo patrón que los diálogos de `catalogos`). En edición el
 * formulario se precarga con un `effect()` y `guardar()` despacha
 * `actualizar` en vez de `crear`.
 *
 * Nota de diseño — la asimetría del checkbox `activo`, que es el punto
 * central de este componente: la casilla SOLO se muestra en creación.
 *
 * - `UsuarioIn` (POST) SÍ declara `activo`, así que crear un usuario ya
 *   desactivado es un caso legítimo y la casilla tiene sentido.
 * - `UsuarioPatch` (PATCH) NO lo declara, a propósito: el estado se cambia
 *   con `POST /{id}/desactivar` y `POST /{id}/reactivar`, que son
 *   transiciones explícitas (la primera con su regla de autoprotección).
 *
 * Dejar la casilla visible en edición sería ofrecer un control que el
 * backend ignoraría: el operador la desmarcaría, vería el diálogo cerrarse
 * con éxito y el usuario seguiría activo. Por eso se oculta, y el estado se
 * cambia desde las acciones de la lista (ver `UsuariosListComponent`).
 *
 * `rol_id` y `ubicacion_id` se eligen con un `p-select` alimentado por
 * `UsuariosLookupsService`, nunca pegando un UUID a mano.
 *
 * Nota de diseño — validación: `Validators.email` es una comprobación de
 * FORMA (que el texto parezca un correo), no una regla de negocio. La
 * unicidad del `email_institucional` la impone la base de datos y NO se
 * pre-chequea acá con una consulta extra; si el correo ya existe, se muestra
 * lo que devuelva el backend (ver `MENSAJE_FALLBACK_EDICION` y
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
      [header]="usuario() ? 'Editar usuario' : 'Nuevo usuario'"
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

        <!-- Solo en creación: UsuarioPatch no acepta activo (ver el
             docblock). En edición, el estado se cambia desde la lista. -->
        @if (!usuario()) {
          <div class="usuario-form-dialog__campo usuario-form-dialog__checkbox">
            <p-checkbox formControlName="activo" [binary]="true" inputId="usuario-activo" />
            <label for="usuario-activo">Usuario activo</label>
          </div>
        }

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
            [label]="usuario() ? 'Guardar cambios' : 'Crear usuario'"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
    .usuario-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .usuario-form-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .usuario-form-dialog__checkbox {
      flex-direction: row;
      align-items: center;
    }

    .usuario-form-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class UsuarioFormDialogComponent {
  readonly visible = model(false);
  /** `null` = creación; un `Usuario` = edición de esa fila. */
  readonly usuario = input<Usuario | null>(null);
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
    nombre: ['', [Validators.required, Validators.maxLength(150)]],
    email_institucional: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    rol_id: ['', Validators.required],
    ubicacion_id: ['', Validators.required],
    activo: [true],
  });

  protected readonly guardando = computed(
    () => this.usuariosService.crear.isPending() || this.usuariosService.actualizar.isPending(),
  );

  constructor() {
    // Sincroniza el formulario con la entrada: al abrir en edición precarga
    // los 4 campos parcheables (más `activo`, que solo mantiene coherente el
    // control oculto y NUNCA se envía), y al volver a creación restaura los
    // valores por defecto.
    effect(() => {
      const usuarioActual = this.usuario();
      if (usuarioActual) {
        this.form.setValue({
          nombre: usuarioActual.nombre,
          email_institucional: usuarioActual.email_institucional,
          rol_id: usuarioActual.rol_id,
          ubicacion_id: usuarioActual.ubicacion_id,
          activo: usuarioActual.activo,
        });
      } else {
        this.form.reset();
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }

    // `activo` se separa del resto: es el único campo que `UsuarioPatch` no
    // admite, así que en edición ni siquiera llega a formar parte del cuerpo.
    const { activo, ...camposParcheables } = this.form.getRawValue();
    const usuarioActual = this.usuario();

    // El diálogo NO se cierra ante un error: el operador necesita ver el
    // mensaje del backend junto a los datos que escribió para corregirlos
    // (típicamente, un correo institucional ya tomado).
    const onError = (error: unknown) =>
      this.messageService.add({
        severity: 'error',
        summary: usuarioActual ? 'No se pudo actualizar el usuario' : 'No se pudo crear el usuario',
        detail: extraerMensajeError(
          error,
          usuarioActual ? MENSAJE_FALLBACK_EDICION : 'Verifica los datos e intenta de nuevo.',
        ),
      });

    if (usuarioActual) {
      this.usuariosService.actualizar.mutate(
        { id: usuarioActual.id, ...camposParcheables },
        {
          onSuccess: () => {
            this.visible.set(false);
            this.guardado.emit();
            this.messageService.add({ severity: 'success', summary: 'Usuario actualizado' });
          },
          onError,
        },
      );
      return;
    }

    this.usuariosService.crear.mutate(
      { ...camposParcheables, activo },
      {
        onSuccess: () => {
          this.visible.set(false);
          this.form.reset();
          this.guardado.emit();
          this.messageService.add({ severity: 'success', summary: 'Usuario creado' });
        },
        onError,
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
