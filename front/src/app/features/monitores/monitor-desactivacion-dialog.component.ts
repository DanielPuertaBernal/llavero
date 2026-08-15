import { Component, computed, inject, input, model, output } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

import { extraerMensajeError } from './monitores-error.util';
import { MonitoresLookupsService } from './monitores-lookups.service';
import { MonitoresService } from './monitores.service';
import { ETIQUETAS_DIA_SEMANA, type Monitor } from './monitores.models';

/**
 * Diálogo de DESACTIVACIÓN de una monitoría
 * (`POST /api/monitores/{id}/desactivar` — ver back/monitores/controller.py).
 *
 * Nota de diseño — es un diálogo propio y no un `ConfirmationService.confirm`
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
 */
@Component({
  selector: 'app-monitor-desactivacion-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule, TagModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Desactivar monitoría"
      [modal]="true"
      [style]="{ width: '28rem' }"
    >
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
            <p-tag
              [severity]="monitorActual.activo ? 'success' : 'danger'"
              [value]="monitorActual.activo ? 'Activa' : 'Inactiva'"
            />
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

      <footer class="monitor-desactivacion-dialog__acciones">
        <p-button
          type="button"
          label="Volver"
          severity="secondary"
          [text]="true"
          (onClick)="cerrar()"
        />
        <p-button
          type="button"
          label="Desactivar monitoría"
          severity="danger"
          [loading]="desactivando()"
          [disabled]="!desactivable()"
          (onClick)="confirmar()"
          ariaLabel="Confirmar desactivación"
        />
      </footer>
    </p-dialog>
  `,
  styles: `
    .monitor-desactivacion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .monitor-desactivacion-dialog__resumen dd {
      margin: 0;
    }

    .monitor-desactivacion-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }
  `,
})
export class MonitorDesactivacionDialogComponent {
  readonly visible = model(false);
  readonly monitor = input<Monitor | null>(null);
  readonly desactivada = output<void>();

  protected readonly lookups = inject(MonitoresLookupsService);
  private readonly monitoresService = inject(MonitoresService);
  private readonly messageService = inject(MessageService);

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
        this.messageService.add({ severity: 'success', summary: 'Monitoría desactivada' });
      },
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo desactivar la monitoría',
          detail: extraerMensajeError(error, 'Intenta de nuevo.'),
        }),
    });
  }

  protected cerrar(): void {
    this.visible.set(false);
  }
}
