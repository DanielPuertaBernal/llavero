import { Component, computed, inject, input, model, output } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { extraerMensajeError } from './novedades-error.util';
import { NovedadesLookupsService } from './novedades-lookups.service';
import { NovedadesService } from './novedades.service';
import { ETIQUETAS_CATEGORIA_NOVEDAD, type Novedad } from './novedades.models';

/**
 * Diálogo de CIERRE de una novedad
 * (`POST /api/novedades/{id}/cerrar` — ver back/novedades/controller.py).
 *
 * Nota de diseño — es un diálogo propio y no un `ConfirmationService.confirm`
 * genérico: a diferencia de `MonitorDesactivacionDialogComponent` y
 * `ReservaCancelacionDialogComponent`, esta transición además EXIGE un dato
 * nuevo (`solucion`, no vacía — ver `CerrarNovedadIn`), así que el diálogo
 * combina el resumen de qué se está cerrando con un formulario de un solo
 * campo, en vez de ser un simple `confirm()`.
 *
 * Nota de diseño — el mensaje de advertencia, el punto central de este
 * componente: el backend de novedades NO tiene endpoint de reapertura
 * (confirmado leyendo back/novedades/controller.py completo — no existe
 * `POST /{id}/reabrir`, solo `GET /`, `GET /{id}`, `POST /`,
 * `GET /estado/{estado}`, `GET /categoria/{categoria}` y
 * `POST /{id}/cerrar`). `cerrar` es la ÚNICA transición de `estado` y no
 * tiene vuelta atrás por esta API, así que el mensaje lo dice explícitamente
 * — mismo criterio que `MonitorDesactivacionDialogComponent`.
 *
 * Nota de diseño — validación de `solucion`: el backend rechaza con 400 una
 * `solucion` vacía (ver back/novedades/controller.py -> service -> domain).
 * El formulario valida lo MISMO del lado cliente (`Validators.required` +
 * rechazar solo espacios en blanco) para no hacerle pagar al operador un
 * viaje de red por un campo que ya sabemos que el backend va a rechazar —
 * pero el backend sigue siendo la autoridad final: su 400 se muestra tal
 * cual si igual llegara a colarse (ver novedades-error.util.ts).
 *
 * Nota de diseño — el botón de confirmar se deshabilita si la novedad ya
 * está cerrada, o si el formulario es inválido: no es duplicar una regla de
 * negocio del backend, es no ofrecer una acción que no significa nada
 * (mismo criterio que `desactivable` en `MonitorDesactivacionDialogComponent`).
 */
@Component({
  selector: 'app-novedad-cierre-dialog',
  standalone: true,
  imports: [DialogModule, ReactiveFormsModule, ButtonModule, TagModule, TextareaModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Cerrar novedad"
      [modal]="true"
      [style]="{ width: '30rem' }"
    >
      @if (novedad(); as novedadActual) {
        <dl class="novedad-cierre-dialog__resumen">
          <dt>Categoría</dt>
          <dd>{{ etiquetaCategoria(novedadActual) }}</dd>
          <dt>Descripción</dt>
          <dd>{{ novedadActual.descripcion ?? 'Sin descripción registrada' }}</dd>
          <dt>Registrada por</dt>
          <dd>{{ lookups.nombreUsuario(novedadActual.registrado_por_id) }}</dd>
          <dt>Estado</dt>
          <dd>
            <p-tag
              [severity]="novedadActual.estado === 'abierta' ? 'warn' : 'success'"
              [value]="novedadActual.estado === 'abierta' ? 'Abierta' : 'Cerrada'"
            />
          </dd>
        </dl>

        @if (!cerrable()) {
          <p role="alert">Esta novedad ya está cerrada.</p>
        } @else {
          <p>
            Esta acción NO se puede deshacer: el backend no ofrece forma de reabrir una novedad
            cerrada.
          </p>

          <form [formGroup]="form" class="novedad-cierre-dialog__form">
            <div class="novedad-cierre-dialog__campo">
              <label for="novedad-solucion">Solución</label>
              <textarea
                id="novedad-solucion"
                pTextarea
                formControlName="solucion"
                rows="4"
                placeholder="Describe qué se hizo para resolver esta novedad"
              ></textarea>
            </div>
          </form>
        }
      }

      <footer class="novedad-cierre-dialog__acciones">
        <p-button
          type="button"
          label="Volver"
          severity="secondary"
          [text]="true"
          (onClick)="cerrar()"
        />
        <p-button
          type="button"
          label="Cerrar novedad"
          severity="danger"
          [loading]="cerrando()"
          [disabled]="!puedeConfirmar()"
          (onClick)="confirmar()"
          ariaLabel="Confirmar cierre"
        />
      </footer>
    </p-dialog>
  `,
  styles: `
    .novedad-cierre-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .novedad-cierre-dialog__resumen dd {
      margin: 0;
    }

    .novedad-cierre-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      margin-top: var(--space-4);
    }

    .novedad-cierre-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .novedad-cierre-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }
  `,
})
export class NovedadCierreDialogComponent {
  readonly visible = model(false);
  readonly novedad = input<Novedad | null>(null);
  readonly cerrada = output<void>();

  protected readonly lookups = inject(NovedadesLookupsService);
  private readonly novedadesService = inject(NovedadesService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    solucion: ['', [Validators.required, noSoloEspacios]],
  });

  protected readonly cerrando = computed(() => this.novedadesService.cerrar.isPending());

  /** Sin novedad seleccionada tampoco hay nada que confirmar: el mismo
   * `computed` cubre el caso vacío y el de una novedad ya cerrada. */
  protected readonly cerrable = computed(() => this.novedad()?.estado === 'abierta');

  /**
   * Método, NO `computed()`: `form.valid` es una propiedad plana de
   * `ReactiveFormsModule`, no un signal, así que envolverla en un `computed`
   * dejaría el resultado cacheado y desactualizado tras cada tecleo (el
   * `computed` solo se re-evalúa cuando cambia uno de los SIGNALS que lee, y
   * `cerrable()` no cambia mientras la novedad seleccionada sigue siendo la
   * misma). Se llama directo desde el template en cada ciclo de detección de
   * cambios, mismo patrón que `[disabled]="form.invalid"` en
   * `UsuarioFormDialogComponent`.
   */
  protected puedeConfirmar(): boolean {
    return this.cerrable() && this.form.valid;
  }

  protected etiquetaCategoria(novedad: Novedad): string {
    return ETIQUETAS_CATEGORIA_NOVEDAD[novedad.categoria];
  }

  protected confirmar(): void {
    const novedadActual = this.novedad();
    if (!novedadActual || !this.puedeConfirmar()) {
      return;
    }

    const { solucion } = this.form.getRawValue();

    this.novedadesService.cerrar.mutate(
      { id: novedadActual.id, solucion },
      {
        onSuccess: () => {
          this.visible.set(false);
          this.form.reset();
          this.cerrada.emit();
          this.messageService.add({ severity: 'success', summary: 'Novedad cerrada' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo cerrar la novedad',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
      },
    );
  }

  protected cerrar(): void {
    this.visible.set(false);
  }
}

/** Rechaza una `solucion` que solo tiene espacios en blanco: el backend
 * exige un texto no vacío, y `''.trim()` sigue significando "nada que decir". */
function noSoloEspacios(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && control.value.trim().length === 0 ? { soloEspacios: true } : null;
}
