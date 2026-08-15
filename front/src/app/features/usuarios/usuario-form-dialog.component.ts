import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '../../core/shared/notification.service';
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
 * `rol_id` y `ubicacion_id` se eligen con un `mat-select` alimentado por
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
 *
 * Migrado de PrimeNG (`p-dialog`) a Angular Material: se mantiene el mismo
 * patrón de visibilidad (`model<boolean>`) para no romper la API pública
 * del componente (`app-usuario-form-dialog [(visible)]="..."` en
 * `usuarios-list.component.ts`); la implementación interna usa las
 * directivas reales de `MatDialogModule` dentro de un overlay condicional,
 * mismo criterio que los diálogos de `catalogos`.
 */
@Component({
  selector: 'app-usuario-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
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
          aria-labelledby="usuario-form-titulo"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title id="usuario-form-titulo">
            {{ usuario() ? 'Editar usuario' : 'Nuevo usuario' }}
          </h2>

          <mat-dialog-content>
            <form [formGroup]="form" (ngSubmit)="guardar()" class="usuario-form-dialog__form">
              <mat-form-field appearance="outline">
                <mat-label>Nombre</mat-label>
                <input matInput id="usuario-nombre" formControlName="nombre" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Correo institucional</mat-label>
                <input
                  matInput
                  id="usuario-email"
                  type="email"
                  formControlName="email_institucional"
                  placeholder="nombre@uco.edu.co"
                />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Rol</mat-label>
                <mat-select id="usuario-rol" formControlName="rol_id" placeholder="Selecciona un rol">
                  @for (opcion of lookups.opcionesRoles(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ubicación</mat-label>
                <mat-select id="usuario-ubicacion" formControlName="ubicacion_id" placeholder="Selecciona una ubicación">
                  @for (opcion of lookups.opcionesUbicaciones(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <!-- Solo en creación: UsuarioPatch no acepta activo (ver el
                   docblock). En edición, el estado se cambia desde la lista. -->
              @if (!usuario()) {
                <mat-checkbox formControlName="activo" id="usuario-activo">Usuario activo</mat-checkbox>
              }
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
                {{ usuario() ? 'Guardar cambios' : 'Crear usuario' }}
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
      width: 30rem;
      max-width: 92vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4);
    }

    .usuario-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
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
  private readonly notificationService = inject(NotificationService);
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
      this.notificationService.error(
        usuarioActual ? 'No se pudo actualizar el usuario' : 'No se pudo crear el usuario',
        extraerMensajeError(error, usuarioActual ? MENSAJE_FALLBACK_EDICION : 'Verifica los datos e intenta de nuevo.'),
      );

    if (usuarioActual) {
      this.usuariosService.actualizar.mutate(
        { id: usuarioActual.id, ...camposParcheables },
        {
          onSuccess: () => {
            this.visible.set(false);
            this.guardado.emit();
            this.notificationService.success('Usuario actualizado');
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
          this.notificationService.success('Usuario creado');
        },
        onError,
      },
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
