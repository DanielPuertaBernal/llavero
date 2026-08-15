import { Component, computed, inject, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './reservas-error.util';
import { ReservasLookupsService } from './reservas-lookups.service';
import { ReservasService } from './reservas.service';
import {
  ETIQUETAS_ESTADO_RESERVA,
  formatearFecha,
  formatearHora,
  type Reserva,
} from './reservas.models';

/**
 * Diálogo de CANCELACIÓN de una reserva individual
 * (`POST /api/reservas/{id}/cancelar` — ver back/reservas/controller.py). No
 * edita la reserva: dispara la única transición de estado que un operador
 * puede pedir explícitamente (`aprobada` -> `cancelada`). Las otras dos
 * (`completada` por la entrega de la llave, `no_reclamada` por tiempo) no
 * tienen endpoint HTTP a propósito.
 *
 * Nota de diseño — es un diálogo propio y no un `ConfirmService.confirmar`
 * genérico como el de `usuarios`: cancelar libera una franja horaria concreta
 * de un salón concreto, y el operador necesita ver QUÉ está cancelando
 * (salón, solicitante, fecha, franja y motivo) antes de confirmar — un id o
 * un texto de una línea no alcanzan. Es la misma forma que
 * `prestamo-devolucion-dialog`: un diálogo por acción de fila, con `input` de
 * la entidad y `model` de visibilidad, reutilizado fila por fila desde la
 * tabla.
 *
 * Nota de diseño — el botón de confirmar se deshabilita si la reserva no está
 * `aprobada`. Eso no es duplicar una regla del backend: es no ofrecer una
 * acción que la PROPIA reserva ya declaró imposible en el `estado` que
 * acabamos de renderizar (mismo criterio que el multiselect de
 * `prestamo-devolucion-dialog`, que solo ofrece los equipos todavía
 * `entregado`). La carrera entre pestañas sigue siendo del backend: si el
 * estado cambió mientras el diálogo estaba abierto, su 400 se muestra tal
 * cual (ver reservas-error.util.ts).
 *
 * Migración PrimeNG -> Angular Material: `p-dialog` -> panel propio con las
 * directivas reales de `MatDialogModule`; `p-tag` -> badge propio (misma
 * clase que `reservas-list`); `MessageService` -> `NotificationService`.
 */
@Component({
  selector: 'app-reserva-cancelacion-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (keydown.escape)="cerrar()">
        <div class="dialogo__panel" role="dialog" aria-modal="true" aria-label="Cancelar reserva">
          <h2 mat-dialog-title>Cancelar reserva</h2>
          <mat-dialog-content>
            @if (reserva(); as reservaActual) {
              <dl class="reserva-cancelacion-dialog__resumen">
                <dt>Salón</dt>
                <dd>{{ lookups.nombreSalon(reservaActual.salon_id) }}</dd>
                <dt>Solicitante</dt>
                <dd>{{ lookups.nombrePersona(reservaActual.solicitante_id) }}</dd>
                <dt>Fecha</dt>
                <dd>{{ fecha(reservaActual) }}</dd>
                <dt>Franja</dt>
                <dd>{{ franja(reservaActual) }}</dd>
                <dt>Motivo</dt>
                <dd>{{ reservaActual.motivo ?? 'Sin motivo registrado' }}</dd>
                <dt>Estado</dt>
                <dd><span class="badge badge--info">{{ etiquetaEstado(reservaActual) }}</span></dd>
              </dl>

              @if (!cancelable()) {
                <p role="alert">
                  Solo se puede cancelar una reserva aprobada. Esta ya está
                  {{ etiquetaEstado(reservaActual).toLowerCase() }}.
                </p>
              } @else {
                <p>Se liberará la franja para el salón en esa fecha. Esta acción no se puede deshacer.</p>
              }
            }
          </mat-dialog-content>

          <mat-dialog-actions align="end">
            <button mat-button type="button" (click)="cerrar()">Volver</button>
            <button
              mat-raised-button
              color="warn"
              type="button"
              [disabled]="!cancelable() || cancelando()"
              (click)="confirmar()"
              aria-label="Confirmar cancelación"
            >
              {{ cancelando() ? 'Cancelando...' : 'Cancelar reserva' }}
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

    .reserva-cancelacion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2, 0.5rem) var(--space-4, 1rem);
      margin: 0 0 var(--space-4, 1rem);
    }

    .reserva-cancelacion-dialog__resumen dd {
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

    .badge--info {
      background: #04b5ac;
    }
  `,
})
export class ReservaCancelacionDialogComponent {
  readonly visible = model(false);
  readonly reserva = input<Reserva | null>(null);
  readonly cancelada = output<void>();

  protected readonly lookups = inject(ReservasLookupsService);
  private readonly reservasService = inject(ReservasService);
  private readonly notificationService = inject(NotificationService);

  protected readonly cancelando = computed(() => this.reservasService.cancelar.isPending());

  /** Sin reserva seleccionada tampoco hay nada que confirmar: el mismo
   * `computed` cubre el caso vacío y el de un estado no cancelable. */
  protected readonly cancelable = computed(() => this.reserva()?.estado === 'aprobada');

  protected fecha(reserva: Reserva): string {
    return formatearFecha(reserva.fecha);
  }

  protected franja(reserva: Reserva): string {
    return `${formatearHora(reserva.hora_inicio)} — ${formatearHora(reserva.hora_fin)}`;
  }

  protected etiquetaEstado(reserva: Reserva): string {
    return ETIQUETAS_ESTADO_RESERVA[reserva.estado];
  }

  protected confirmar(): void {
    const reservaActual = this.reserva();
    if (!reservaActual || !this.cancelable()) {
      return;
    }

    this.reservasService.cancelar.mutate(
      { id: reservaActual.id },
      {
        onSuccess: () => {
          this.visible.set(false);
          this.cancelada.emit();
          this.notificationService.success('Reserva cancelada');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo cancelar la reserva',
            extraerMensajeError(error, 'Intenta de nuevo.'),
          ),
      },
    );
  }

  protected cerrar(): void {
    this.visible.set(false);
  }
}
