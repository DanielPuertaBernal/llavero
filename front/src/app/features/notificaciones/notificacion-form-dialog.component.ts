import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { AuthService } from '../../core/auth/auth.service';
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
 */
@Component({
  selector: 'app-notificacion-form-dialog',
  standalone: true,
  imports: [
    DialogModule,
    ReactiveFormsModule,
    SelectModule,
    InputTextModule,
    TextareaModule,
    ButtonModule,
  ],
  template: `
    <p-dialog
      [(visible)]="visible"
      [header]="modo() === 'manual' ? 'Enviar notificación' : 'Enviar recordatorio'"
      [modal]="true"
      [style]="{ width: '32rem' }"
    >
      <form [formGroup]="form" (ngSubmit)="guardar()" class="notificacion-form-dialog__form">
        <div class="notificacion-form-dialog__campo">
          <label for="notificacion-destinatario">Destinatario</label>
          <p-select
            id="notificacion-destinatario"
            formControlName="destinatario_id"
            [options]="lookups.opcionesPersonas()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona el destinatario"
          />
        </div>

        @if (modo() === 'manual') {
          <div class="notificacion-form-dialog__campo">
            <label for="notificacion-asunto">Asunto</label>
            <input
              pInputText
              id="notificacion-asunto"
              type="text"
              formControlName="asunto"
              placeholder="Asunto del mensaje"
            />
          </div>
        }

        <div class="notificacion-form-dialog__campo">
          <label for="notificacion-mensaje">
            {{ modo() === 'manual' ? 'Mensaje' : 'Mensaje (opcional)' }}
          </label>
          <textarea
            pTextarea
            id="notificacion-mensaje"
            formControlName="mensaje"
            rows="4"
            [placeholder]="
              modo() === 'manual'
                ? 'Escribe el mensaje'
                : 'Déjalo en blanco para usar la plantilla de recordatorio configurada'
            "
          ></textarea>
        </div>

        <footer class="notificacion-form-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            [label]="modo() === 'manual' ? 'Enviar notificación' : 'Enviar recordatorio'"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
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
  private readonly messageService = inject(MessageService);
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
        asuntoControl.setValidators([Validators.required]);
        mensajeControl.setValidators([Validators.required]);
      } else {
        asuntoControl.clearValidators();
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
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo enviar la notificación',
          detail: 'No hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.',
        });
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
            this.messageService.add({
              severity: 'error',
              summary: 'No se pudo enviar la notificación',
              detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
            }),
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
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo enviar el recordatorio',
            detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
          }),
      },
    );
  }

  private alEnviarConExito(): void {
    this.visible.set(false);
    this.form.reset({ destinatario_id: '', asunto: '', mensaje: '' });
    this.enviado.emit();
    this.messageService.add({
      severity: 'success',
      summary: this.modo() === 'manual' ? 'Notificación enviada' : 'Recordatorio enviado',
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
