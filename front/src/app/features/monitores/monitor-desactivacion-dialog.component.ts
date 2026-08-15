import { Component, computed, inject, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './monitores-error.util';
import { MonitoresLookupsService } from './monitores-lookups.service';
import { MonitoresService } from './monitores.service';
import { ETIQUETAS_DIA_SEMANA, type Monitor } from './monitores.models';

/**
 * Diálogo de DESACTIVACIÓN de una monitoría
 * (`POST /api/monitores/{id}/desactivar` — ver back/monitores/controller.py).
 *
 * Nota de diseño — es un diálogo propio y no un `ConfirmService.confirmar`
 * genérico: el operador necesita ver QUÉ está desactivando (docente titular,
 * monitor delegado, materia, aula, día y horario) antes de confirmar, mismo
 * criterio que `ReservaCancelacionDialogComponent`.
 *
 * Nota de diseño — el mensaje de advertencia, el punto central de este
 * componente: a diferencia de `usuarios` (que sí expone
 * `POST /{id}/reactivar`), el backend de monitores NO tiene endpoint de
 * reactivación (confirmado leyendo back/monitores/controller.py completo).
 * `desactivar` es la ÚNICA transición de `activo` y no tiene vuelta atrás por
 * esta API, así que el mensaje lo dice explícitamente — decir lo contrario
 * sería mentirle al operador (mismo criterio que aplicaba `usuarios` antes de
 * que le agregaran `reactivar`).
 *
 * Nota de diseño — el botón de confirmar se deshabilita si la monitoría ya
 * está inactiva: no es duplicar una regla de negocio del backend, es no
 * ofrecer una acción que la propia fila ya declaró sin sentido (mismo
 * criterio que `puedeDesactivar` en `UsuariosListComponent` y `cancelable`
 * en `ReservaCancelacionDialogComponent`).
 *
 * Migración PrimeNG -> Angular Material: `p-dialog` -> panel propio con las
 * directivas reales de `MatDialogModule`; `p-tag` -> badge propio;
 * `MessageService` -> `NotificationService`.
 */
@Component({
  selector: 'app-monitor-desactivacion-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (keydown.escape)="cerrar()">
        <div class="dialogo__panel" role="dialog" aria-modal="true" aria-label="Desactivar monitoría">
          <h2 mat-dialog-title>Desactivar monitoría</h2>
          <mat-dialog-content>
            @if (monitor(); as monitorActual) {
              <dl class="monitor-desactivacion-dialog__resumen">
                <dt>Docente titular</dt>
                <dd>{{ lookups.nombrePersona(monitorActual.docente_titular_id) }}</dd>
                <dt>Monitor delegado</dt>
                <dd>{{ lookups.nombrePersona(monitorActual.monitor_delegado_id) }}</dd>
                <dt>Materia</dt>
                <dd>{{ monitorActual.materia }}</dd>
                <dt>Aula</dt>
                <dd>{{ monitorActual.aula ?? 'Sin aula fija' }}</dd>
                <dt>Día</dt>
                <dd>{{ diaLegible(monitorActual) }}</dd>
                <dt>Horario</dt>
                <dd>{{ monitorActual.horario ?? 'Sin horario fijo' }}</dd>
                <dt>Estado</dt>
                <dd>
                  <span class="badge" [class.badge--exito]="monitorActual.activo" [class.badge--peligro]="!monitorActual.activo">
                    {{ monitorActual.activo ? 'Activa' : 'Inactiva' }}
                  </span>
                </dd>
              </dl>

              @if (!desactivable()) {
                <p role="alert">Esta monitoría ya está inactiva.</p>
              } @else {
                <p>
                  El monitor delegado perderá esta delegación de inmediato. Esta acción NO se puede
                  deshacer: el backend no ofrece forma de reactivarla.
                </p>
              }
            }
          </mat-dialog-content>

          <mat-dialog-actions align="end">
            <button mat-button type="button" (click)="cerrar()">Volver</button>
            <button
              mat-raised-button
              color="warn"
              type="button"
              [disabled]="!desactivable() || desactivando()"
              (click)="confirmar()"
              aria-label="Confirmar desactivación"
            >
              {{ desactivando() ? 'Desactivando...' : 'Desactivar monitoría' }}
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
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 28rem;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4, 1rem);
    }

    .monitor-desactivacion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2, 0.5rem) var(--space-4, 1rem);
      margin: 0 0 var(--space-4, 1rem);
    }

    .monitor-desactivacion-dialog__resumen dd {
      margin: 0;
    }

    .badge {
      display: inline-block;
      padding: 0.15rem 0.75rem;
      border-radius: 999px;
      font-family: Poppins, sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      color: #ffffff;
    }

    .badge--exito {
      background: #008b50;
    }

    .badge--peligro {
      background: #e28210;
    }
  `,
})
export class MonitorDesactivacionDialogComponent {
  readonly visible = model(false);
  readonly monitor = input<Monitor | null>(null);
  readonly desactivada = output<void>();

  protected readonly lookups = inject(MonitoresLookupsService);
  private readonly monitoresService = inject(MonitoresService);
  private readonly notificationService = inject(NotificationService);

  protected readonly desactivando = computed(() => this.monitoresService.desactivar.isPending());

  /** Sin monitoría seleccionada tampoco hay nada que confirmar: el mismo
   * `computed` cubre el caso vacío y el de una monitoría ya inactiva. */
  protected readonly desactivable = computed(() => this.monitor()?.activo === true);

  protected diaLegible(monitor: Monitor): string {
    return monitor.dia ? ETIQUETAS_DIA_SEMANA[monitor.dia] : 'Cualquier día con clase';
  }

  protected confirmar(): void {
    const monitorActual = this.monitor();
    if (!monitorActual || !this.desactivable()) {
      return;
    }

    this.monitoresService.desactivar.mutate(monitorActual.id, {
      onSuccess: () => {
        this.visible.set(false);
        this.desactivada.emit();
        this.notificationService.success('Monitoría desactivada');
      },
      onError: (error) =>
        this.notificationService.error(
          'No se pudo desactivar la monitoría',
          extraerMensajeError(error, 'Intenta de nuevo.'),
        ),
    });
  }

  protected cerrar(): void {
    this.visible.set(false);
  }
}
