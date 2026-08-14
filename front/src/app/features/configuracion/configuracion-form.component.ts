import { Component, computed, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';

import { extraerMensajeError } from './configuracion-error.util';
import { ConfiguracionLookupsService } from './configuracion-lookups.service';
import { ConfiguracionService } from './configuracion.service';
import type { ConfiguracionInput } from './configuracion.models';

/**
 * Vista de configuración global: un formulario de EDICIÓN de una única fila
 * que siempre existe (ver la nota de alcance en `configuracion.models.ts`).
 * A diferencia de todas las demás features, no hay lista ni modo creación —
 * solo `GET /api/configuracion/` para precargar y `PUT /api/configuracion/`
 * para guardar los 5 campos completos.
 *
 * Nota de diseño — el formulario arranca deshabilitado mientras
 * `configuracion.isPending()`: no tiene sentido dejar editar campos sobre
 * valores por defecto que todavía no se sabe si son los reales. El `effect`
 * de más abajo precarga los 5 controles apenas llega la respuesta.
 *
 * Nota de diseño — `plantilla_recordatorio` es `string | null` en el
 * contrato pero el control de formulario usa siempre `string` (`''` para
 * "sin plantilla"): es el mismo criterio que el resto de esta app usa para
 * campos de texto opcionales (ver `ReservaFormDialogComponent.motivo`), y
 * `guardar()` convierte `''` de vuelta a `null` al armar el payload.
 *
 * Nota de arquitectura — `MessageService` se provee acá, a nivel de
 * componente (mismo patrón que `UsuariosListComponent`), porque esta es la
 * vista de nivel de RUTA de la feature, no un diálogo anidado dentro de
 * otra.
 */
@Component({
  selector: 'app-configuracion-form',
  standalone: true,
  imports: [ReactiveFormsModule, InputNumberModule, TextareaModule, SelectModule, ButtonModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <h1>Configuración</h1>

    @if (configuracionService.configuracion.isPending()) {
      <p>Cargando configuración...</p>
    } @else if (configuracionService.configuracion.isError()) {
      <p role="alert">No se pudo cargar la configuración. Intenta de nuevo.</p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="guardar()" class="configuracion-form__form">
        <div class="configuracion-form__campo">
          <label for="configuracion-limite-mora">
            Minutos antes de considerar una llave en mora
          </label>
          <p-inputnumber id="configuracion-limite-mora" formControlName="limite_antes_mora_minutos" />
        </div>

        <div class="configuracion-form__campo">
          <label for="configuracion-max-reintentos">
            Máximo de reintentos de recordatorio
          </label>
          <p-inputnumber id="configuracion-max-reintentos" formControlName="max_reintentos_recordatorio" />
        </div>

        <div class="configuracion-form__campo">
          <label for="configuracion-limite-no-reclamada">
            Minutos antes de considerar una reserva no reclamada
          </label>
          <p-inputnumber
            id="configuracion-limite-no-reclamada"
            formControlName="limite_no_reclamada_minutos"
          />
        </div>

        <div class="configuracion-form__campo">
          <label for="configuracion-plantilla">Plantilla de recordatorio (opcional)</label>
          <textarea
            pTextarea
            id="configuracion-plantilla"
            formControlName="plantilla_recordatorio"
            rows="4"
            placeholder="Déjalo en blanco para no usar una plantilla por defecto"
          ></textarea>
        </div>

        <div class="configuracion-form__campo">
          <label for="configuracion-ubicacion-defecto">Ubicación por defecto</label>
          <p-select
            id="configuracion-ubicacion-defecto"
            formControlName="ubicacion_defecto_id"
            [options]="lookups.opcionesUbicaciones()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            placeholder="Selecciona una ubicación"
          />
        </div>

        <footer class="configuracion-form__acciones">
          <p-button type="submit" label="Guardar" [loading]="guardando()" [disabled]="form.invalid" />
        </footer>
      </form>
    }
  `,
})
export class ConfiguracionFormComponent {
  protected readonly lookups = inject(ConfiguracionLookupsService);
  protected readonly configuracionService = inject(ConfiguracionService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    limite_antes_mora_minutos: [0, [Validators.required, Validators.min(0)]],
    max_reintentos_recordatorio: [0, [Validators.required, Validators.min(0)]],
    plantilla_recordatorio: [''],
    ubicacion_defecto_id: ['', Validators.required],
    limite_no_reclamada_minutos: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly guardando = computed(() => this.configuracionService.actualizar.isPending());

  constructor() {
    // Precarga los 5 controles apenas llega la respuesta del GET. No hay
    // rama "sin datos" que restaurar a default: a diferencia de un diálogo
    // de creación/edición, acá siempre hay una fila que editar.
    effect(() => {
      const configuracion = this.configuracionService.configuracion.data();
      if (configuracion) {
        this.form.setValue({
          limite_antes_mora_minutos: configuracion.limite_antes_mora_minutos,
          max_reintentos_recordatorio: configuracion.max_reintentos_recordatorio,
          plantilla_recordatorio: configuracion.plantilla_recordatorio ?? '',
          ubicacion_defecto_id: configuracion.ubicacion_defecto_id,
          limite_no_reclamada_minutos: configuracion.limite_no_reclamada_minutos,
        });
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      return;
    }

    const valores = this.form.getRawValue();
    const payload: ConfiguracionInput = {
      ubicacion_defecto_id: valores.ubicacion_defecto_id,
      limite_antes_mora_minutos: valores.limite_antes_mora_minutos,
      max_reintentos_recordatorio: valores.max_reintentos_recordatorio,
      plantilla_recordatorio: valores.plantilla_recordatorio ? valores.plantilla_recordatorio : null,
      limite_no_reclamada_minutos: valores.limite_no_reclamada_minutos,
    };

    this.configuracionService.actualizar.mutate(payload, {
      onSuccess: () =>
        this.messageService.add({ severity: 'success', summary: 'Configuración actualizada' }),
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo actualizar la configuración',
          detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        }),
    });
  }
}
