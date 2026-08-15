import { Component, computed, inject, input, model, output } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './novedades-error.util';
import { NovedadesLookupsService } from './novedades-lookups.service';
import { NovedadesService } from './novedades.service';
import { ETIQUETAS_CATEGORIA_NOVEDAD, type Novedad } from './novedades.models';

/**
 * Diálogo de CIERRE de una novedad
 * (`POST /api/novedades/{id}/cerrar` — ver back/novedades/controller.py).
 *
 * Nota de diseño — es un diálogo propio y no un `ConfirmService.confirmar`
 * genérico: a diferencia de `MonitorDesactivacionDialogComponent` y
 * `ReservaCancelacionDialogComponent`, esta transición además EXIGE un dato
 * nuevo (`solucion`, no vacía — ver `CerrarNovedadIn`), así que el diálogo
 * combina el resumen de qué se está cerrando con un formulario de un solo
 * campo, en vez de ser una simple confirmación. El mensaje de advertencia de
 * abajo ("NO se puede deshacer") cumple, dentro de este diálogo propio, el
 * mismo rol que `peligro: true` cumpliría en un `ConfirmService.confirmar`.
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
 *
 * Migración PrimeNG → Angular Material: el `visible` model input se
 * mantiene igual (renderizado inline en `novedades-list.component.ts`), solo
 * cambia el componente concreto del overlay/panel, ahora con las directivas
 * de `MatDialogModule` sobre los estilos literales de "Diálogo/modal" de la
 * especificación visual UCO, y el badge de estado con los colores de
 * "Badge de estado" de esa misma especificación. `MessageService.add(...)`
 * se reemplaza por `NotificationService`. El botón "Cerrar novedad" se pinta
 * con el color de peligro (`#e28210`) porque es una acción irreversible.
 */
@Component({
  selector: 'app-novedad-cierre-dialog',
  standalone: true,
  imports: [MatDialogModule, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (click)="cerrar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Cerrar novedad"
          (click)="$event.stopPropagation()"
        >
          <h2 mat-dialog-title>Cerrar novedad</h2>

          <mat-dialog-content>
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
                  <span
                    [class]="
                      novedadActual.estado === 'abierta'
                        ? 'badge badge--atencion'
                        : 'badge badge--exito'
                    "
                  >
                    {{ novedadActual.estado === 'abierta' ? 'Abierta' : 'Cerrada' }}
                  </span>
                </dd>
              </dl>

              @if (!cerrable()) {
                <p role="alert">Esta novedad ya está cerrada.</p>
              } @else {
                <p>
                  Esta acción NO se puede deshacer: el backend no ofrece forma de reabrir una
                  novedad cerrada.
                </p>

                <form [formGroup]="form" class="novedad-cierre-dialog__form">
                  <mat-form-field appearance="outline" class="novedad-cierre-dialog__campo">
                    <mat-label>Solución</mat-label>
                    <textarea
                      matInput
                      formControlName="solucion"
                      rows="4"
                      placeholder="Describe qué se hizo para resolver esta novedad"
                    ></textarea>
                  </mat-form-field>
                </form>
              }
            }
          </mat-dialog-content>

          <mat-dialog-actions align="end">
            <button mat-stroked-button type="button" (click)="cerrar()">Volver</button>
            <button
              mat-raised-button
              type="button"
              class="novedad-cierre-dialog__boton-peligro"
              [disabled]="!puedeConfirmar() || cerrando()"
              (click)="confirmar()"
              aria-label="Confirmar cierre"
            >
              {{ cerrando() ? 'Cerrando…' : 'Cerrar novedad' }}
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
      box-shadow: 0 8px 24px rgba(26, 26, 26, 0.2);
      width: 30rem;
      max-width: calc(100vw - var(--space-4) * 2);
      padding: var(--space-4);
    }

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
      gap: var(--space-2);
    }

    .novedad-cierre-dialog__campo {
      width: 100%;
    }

    .novedad-cierre-dialog__boton-peligro {
      background-color: #e28210;
      color: #ffffff;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 10px;
      font-family: Poppins, sans-serif;
      font-size: 11px;
      font-weight: 700;
    }

    .badge--atencion {
      background: #ffca00;
      color: #1a1a1a;
    }

    .badge--exito {
      background: #008b50;
      color: #ffffff;
    }
  `,
})
export class NovedadCierreDialogComponent {
  readonly visible = model(false);
  readonly novedad = input<Novedad | null>(null);
  readonly cerrada = output<void>();

  protected readonly lookups = inject(NovedadesLookupsService);
  private readonly novedadesService = inject(NovedadesService);
  private readonly notificationService = inject(NotificationService);
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
          this.notificationService.success('Novedad cerrada');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo cerrar la novedad',
            extraerMensajeError(error, 'Intenta de nuevo.'),
          ),
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
