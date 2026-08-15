import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './notificaciones-error.util';
import { NotificacionesLookupsService } from './notificaciones-lookups.service';
import { NotificacionesService } from './notificaciones.service';

/** Datos para pre-rellenar el formulario en modo 'manual', ej. al reenviar
 * una notificación fallida (ver docstring del componente, más abajo). */
export interface NotificacionPrecarga {
  destinatario_id: string;
  asunto: string;
  mensaje: string;
}

/**
 * Diálogo de ENVÍO de notificaciones. Es el único "crear" de la feature: no
 * existe modo edición, porque el backend no tiene forma de mutar una
 * `Notificacion` existente (ver el docstring de `NotificacionesService`).
 *
 * Dos modos, según qué botón de `notificaciones-list.component.ts` lo abrió:
 *
 * - `'manual'` (default): formulario completo — destinatario, asunto y
 *   mensaje, los 3 requeridos, `POST /api/notificaciones/manual`
 *   (`NotificacionManualIn`, ver back/notificaciones/controller.py).
 *   `enviado_por_id` NO es un campo del formulario: sale de
 *   `AuthService.currentUser().id`, mismo patrón que `usuarios-list.
 *   component.ts` resuelve `usuario_actual_id` para `desactivar` — el
 *   operador que envía el mensaje es quien tiene la sesión abierta, no un
 *   dato que deba escribir a mano.
 * - `'recordatorio'`: solo destinatario (requerido) y mensaje (OPCIONAL) —
 *   sin campo asunto, porque `RecordatorioIn` no lo tiene. `POST
 *   /api/notificaciones/recordatorio`. Si el operador deja el mensaje en
 *   blanco, la clave se OMITE del payload para que el backend aplique su
 *   propio default (la plantilla de `configuracion`, ver
 *   `NotificacionesService.enviarRecordatorio`) — mandar `''` forzaría un
 *   mensaje vacío en vez de "usa la plantilla".
 *
 * Nota de diseño — "Reenviar" (RF24, ver `NotificacionesService` para el gap
 * de que no existe endpoint de reenvío) reutiliza este MISMO diálogo en modo
 * `'manual'`, con el input `precarga` poblado desde
 * `notificaciones-list.component.ts` con los datos (destinatario, asunto,
 * mensaje) de la notificación fallida. Al guardar, dispara un
 * `enviarManual.mutate(...)` normal: crea una fila NUEVA con esos mismos
 * datos, nunca muta la que falló. Un `effect()` (no un `ngOnChanges`, porque
 * `precarga`/`visible` son señales) parchea el formulario cada vez que el
 * diálogo se abre con una precarga presente.
 *
 * Nota de diseño — validación dinámica de `asunto`/`mensaje` según `modo`, en
 * vez de dos `FormGroup` separados: son casi el mismo formulario (comparten
 * `destinatario_id`), y la única diferencia real es qué campos son
 * requeridos — un `effect()` que ajusta los `Validators` de esos dos
 * controles cuando `modo()` cambia evita duplicar el resto del formulario y
 * su plantilla.
 *
 * Migración PrimeNG → Angular Material: el `visible` model input se
 * mantiene igual (el diálogo se sigue renderizando inline en
 * `notificaciones-list.component.ts`, no vía `MatDialog.open()`) — solo
 * cambia el componente concreto que dibuja el overlay/panel, ahora con las
 * directivas de `MatDialogModule` (`mat-dialog-title`/`mat-dialog-content`/
 * `mat-dialog-actions`) sobre los estilos literales de "Diálogo/modal" de la
 * especificación visual UCO. `MessageService.add(...)` se reemplaza por
 * `NotificationService`.
 */
@Component({
  selector: 'app-notificacion-form-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (click)="cancelar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="modo() === 'manual' ? 'Enviar notificación' : 'Enviar recordatorio'"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title>
            {{ modo() === 'manual' ? 'Enviar notificación' : 'Enviar recordatorio' }}
          </h2>

          <form [formGroup]="form" (ngSubmit)="guardar()" class="notificacion-form-dialog__form">
            <mat-dialog-content>
              <mat-form-field appearance="outline" class="notificacion-form-dialog__campo">
                <mat-label>Destinatario</mat-label>
                <mat-select formControlName="destinatario_id" placeholder="Selecciona el destinatario">
                  @for (opcion of lookups.opcionesPersonas(); track opcion.value) {
                    <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              @if (modo() === 'manual') {
                <mat-form-field appearance="outline" class="notificacion-form-dialog__campo">
                  <mat-label>Asunto</mat-label>
                  <input matInput formControlName="asunto" placeholder="Asunto del mensaje" />
                </mat-form-field>
              }

              <mat-form-field appearance="outline" class="notificacion-form-dialog__campo">
                <mat-label>{{ modo() === 'manual' ? 'Mensaje' : 'Mensaje (opcional)' }}</mat-label>
                <textarea
                  matInput
                  formControlName="mensaje"
                  rows="4"
                  [placeholder]="
                    modo() === 'manual'
                      ? 'Escribe el mensaje'
                      : 'Déjalo en blanco para usar la plantilla de recordatorio configurada'
                  "
                ></textarea>
              </mat-form-field>
            </mat-dialog-content>

            <mat-dialog-actions align="end">
              <button mat-stroked-button type="button" (click)="cancelar()">Cancelar</button>
              <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || guardando()">
                {{
                  guardando()
                    ? 'Enviando…'
                    : modo() === 'manual'
                      ? 'Enviar notificación'
                      : 'Enviar recordatorio'
                }}
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
      width: 32rem;
      max-width: calc(100vw - var(--space-4) * 2);
      padding: var(--space-4);
    }

    .notificacion-form-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .notificacion-form-dialog__campo {
      width: 100%;
    }
  `,
})
export class NotificacionFormDialogComponent {
  readonly visible = model(false);
  readonly modo = input<'manual' | 'recordatorio'>('manual');
  readonly precarga = input<NotificacionPrecarga | null>(null);
  readonly enviado = output<void>();

  protected readonly lookups = inject(NotificacionesLookupsService);
  private readonly notificacionesService = inject(NotificacionesService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  // `destinatario_id` siempre requerido. `asunto`/`mensaje` arrancan sin
  // validadores propios: el `effect()` de abajo los ajusta según `modo()`.
  protected readonly form = this.fb.nonNullable.group({
    destinatario_id: ['', Validators.required],
    asunto: [''],
    mensaje: [''],
  });

  protected readonly guardando = computed(
    () => this.notificacionesService.enviarManual.isPending() ||
      this.notificacionesService.enviarRecordatorio.isPending(),
  );

  constructor() {
    effect(() => {
      const asuntoControl = this.form.controls.asunto;
      const mensajeControl = this.form.controls.mensaje;
      if (this.modo() === 'manual') {
        asuntoControl.setValidators([Validators.required, Validators.maxLength(200)]);
        mensajeControl.setValidators([Validators.required]);
      } else {
        asuntoControl.setValidators([Validators.maxLength(200)]);
        mensajeControl.clearValidators();
      }
      asuntoControl.updateValueAndValidity({ emitEvent: false });
      mensajeControl.updateValueAndValidity({ emitEvent: false });
    });

    // Ver la nota de diseño del docblock: parchea el formulario con los datos
    // de la notificación fallida cada vez que el diálogo se abre con una
    // precarga presente.
    effect(() => {
      const precargaActual = this.precarga();
      if (this.visible() && precargaActual) {
        this.form.patchValue(precargaActual);
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();

    if (this.modo() === 'manual') {
      const usuarioActual = this.authService.currentUser();
      if (!usuarioActual) {
        // Mismo criterio que `usuarios-list.component.ts.desactivar`: sin id
        // de operador no se despacha nada.
        this.notificationService.error(
          'No se pudo enviar la notificación',
          'No hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.',
        );
        return;
      }

      this.notificacionesService.enviarManual.mutate(
        {
          destinatario_id: valores.destinatario_id,
          asunto: valores.asunto.trim(),
          mensaje: valores.mensaje.trim(),
          enviado_por_id: usuarioActual.id,
        },
        {
          onSuccess: () => this.alEnviarConExito(),
          onError: (error) =>
            this.notificationService.error(
              'No se pudo enviar la notificación',
              extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
            ),
        },
      );
      return;
    }

    const mensaje = valores.mensaje.trim();
    this.notificacionesService.enviarRecordatorio.mutate(
      {
        destinatario_id: valores.destinatario_id,
        // Ver la nota de diseño del docblock: sin mensaje, la clave ni
        // siquiera viaja, para que el backend aplique su plantilla.
        ...(mensaje ? { mensaje } : {}),
      },
      {
        onSuccess: () => this.alEnviarConExito(),
        onError: (error) =>
          this.notificationService.error(
            'No se pudo enviar el recordatorio',
            extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
          ),
      },
    );
  }

  private alEnviarConExito(): void {
    this.visible.set(false);
    this.form.reset({ destinatario_id: '', asunto: '', mensaje: '' });
    this.enviado.emit();
    this.notificationService.success(
      this.modo() === 'manual' ? 'Notificación enviada' : 'Recordatorio enviado',
    );
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
