import { Component, computed, inject, input, model, output } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

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
 * Nota de diseño — es un diálogo propio y no un `ConfirmationService.confirm`
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
 */
@Component({
  selector: 'app-reserva-cancelacion-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule, TagModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Cancelar reserva"
      [modal]="true"
      [style]="{ width: '28rem' }"
    >
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
          <dd><p-tag [value]="etiquetaEstado(reservaActual)" /></dd>
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

      <footer class="reserva-cancelacion-dialog__acciones">
        <p-button
          type="button"
          label="Volver"
          severity="secondary"
          [text]="true"
          (onClick)="cerrar()"
        />
        <p-button
          type="button"
          label="Cancelar reserva"
          severity="danger"
          [loading]="cancelando()"
          [disabled]="!cancelable()"
          (onClick)="confirmar()"
          ariaLabel="Confirmar cancelación"
        />
      </footer>
    </p-dialog>
  `,
  styles: `
    .reserva-cancelacion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .reserva-cancelacion-dialog__resumen dd {
      margin: 0;
    }

    .reserva-cancelacion-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }
  `,
})
export class ReservaCancelacionDialogComponent {
  readonly visible = model(false);
  readonly reserva = input<Reserva | null>(null);
  readonly cancelada = output<void>();

  protected readonly lookups = inject(ReservasLookupsService);
  private readonly reservasService = inject(ReservasService);
  private readonly messageService = inject(MessageService);

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
          this.messageService.add({ severity: 'success', summary: 'Reserva cancelada' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo cancelar la reserva',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
      },
    );
  }

  protected cerrar(): void {
    this.visible.set(false);
  }
}
