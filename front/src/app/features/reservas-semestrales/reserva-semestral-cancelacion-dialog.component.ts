import { Component, computed, inject, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './reservas-semestrales-error.util';
import { ReservasSemestralesLookupsService } from './reservas-semestrales-lookups.service';
import { ReservasSemestralesService } from './reservas-semestrales.service';
import { ETIQUETAS_DIA_SEMANA, formatearHora, type ReservaSemestral } from './reservas-semestrales.models';

/**
 * Diálogo de CANCELACIÓN de un GRUPO completo de reserva semestral
 * (`POST /api/reservas-semestrales/grupo/{grupo_id}/cancelar` — ver
 * back/reservas_semestrales/controller.py).
 *
 * Nota de dominio — diferencia clave con `ReservaCancelacionDialogComponent`
 * (feature hermana): acá NO hay transición de `estado` (`ReservaSemestral` no
 * tiene esa columna). "Cancelar" es un DELETE real de TODAS las filas del
 * grupo a la vez — irreversible de verdad, no un cambio de estado que se
 * pudiera revertir con otro endpoint. Por eso el `input` es `franjas:
 * ReservaSemestral[]` (todo el grupo), no una sola `ReservaSemestral`: el
 * operador necesita ver EXACTAMENTE cuántas y cuáles franjas va a perder,
 * porque una sola solicitud pudo haber reservado varios días a la vez (ver la
 * nota de dominio de reservas-semestrales.models.ts).
 *
 * Nota de diseño — el botón de confirmar se deshabilita si ALGUNA franja del
 * grupo tiene `creado_manualmente=false`: eso replica al pie de la letra la
 * regla que el backend ya aplica (`service.cancelar_grupo` rechaza con 400 si
 * cualquier fila del grupo es institucional, ver el docstring del
 * controller) — no es una regla nueva inventada acá, es la MISMA que el 400
 * expresaría, mostrada antes de intentar la petición para no hacerle perder
 * el tiempo al operador. La carrera entre pestañas (otra persona cargó una
 * franja institucional en el grupo mientras el diálogo estaba abierto) sigue
 * siendo del backend: si pasa, su 400 se muestra tal cual.
 *
 * Migración PrimeNG -> Angular Material: `p-dialog` -> panel propio con las
 * directivas reales de `MatDialogModule`; `p-tag` -> badge propio;
 * `MessageService` -> `NotificationService`.
 */
@Component({
  selector: 'app-reserva-semestral-cancelacion-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    @if (visible()) {
      <div class="dialogo__overlay" (keydown.escape)="cerrar()">
        <div
          class="dialogo__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar grupo de reserva semestral"
        >
          <h2 mat-dialog-title>Cancelar grupo de reserva semestral</h2>
          <mat-dialog-content>
            @if (primeraFranja(); as primera) {
              <dl class="reserva-semestral-cancelacion-dialog__resumen">
                <dt>Salón</dt>
                <dd>{{ lookups.nombreSalon(primera.salon_id) }}</dd>
                <dt>Solicitante</dt>
                <dd>{{ lookups.nombrePersona(primera.solicitante_id) }}</dd>
                <dt>Semestre</dt>
                <dd>{{ lookups.codigoSemestre(primera.semestre_id) }}</dd>
              </dl>

              <p>
                Se van a eliminar <strong>{{ franjas().length }}</strong> franja(s) de este grupo:
              </p>
              <ul class="reserva-semestral-cancelacion-dialog__franjas">
                @for (f of franjas(); track f.id) {
                  <li>
                    {{ etiquetaDia(f.dia) }} {{ franja(f) }}
                    @if (!f.creado_manualmente) {
                      <span class="badge badge--neutro">institucional</span>
                    }
                  </li>
                }
              </ul>

              @if (!cancelable()) {
                <p role="alert">
                  No se puede cancelar: alguna franja de este grupo fue cargada institucionalmente y no
                  es cancelable vía esta aplicación.
                </p>
              } @else {
                <p>Esta acción no se puede deshacer.</p>
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
              {{ cancelando() ? 'Cancelando...' : 'Cancelar grupo' }}
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
      width: 30rem;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-4, 1rem);
    }

    .reserva-semestral-cancelacion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2, 0.5rem) var(--space-4, 1rem);
      margin: 0 0 var(--space-4, 1rem);
    }

    .reserva-semestral-cancelacion-dialog__resumen dd {
      margin: 0;
    }

    .reserva-semestral-cancelacion-dialog__franjas {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
      margin: var(--space-2, 0.5rem) 0;
      padding-left: var(--space-4, 1rem);
    }

    .badge {
      display: inline-block;
      padding: 0.1rem 0.6rem;
      border-radius: 999px;
      font-family: Poppins, sans-serif;
      font-size: 0.7rem;
      font-weight: 700;
      color: #ffffff;
      margin-left: var(--space-2, 0.5rem);
    }

    .badge--neutro {
      background: #1d3475;
    }
  `,
})
export class ReservaSemestralCancelacionDialogComponent {
  readonly visible = model(false);
  /** Todas las franjas del grupo a cancelar (ver la nota de dominio del
   * docblock). Vacío = nada seleccionado todavía. */
  readonly franjas = input<ReservaSemestral[]>([]);
  readonly cancelada = output<void>();

  protected readonly lookups = inject(ReservasSemestralesLookupsService);
  private readonly reservasSemestralesService = inject(ReservasSemestralesService);
  private readonly notificationService = inject(NotificationService);

  protected readonly cancelando = computed(() => this.reservasSemestralesService.cancelar.isPending());

  protected readonly primeraFranja = computed(() => this.franjas()[0] ?? null);

  /** Sin franjas tampoco hay nada que confirmar: el mismo `computed` cubre el
   * caso vacío y el de un grupo con alguna franja institucional. */
  protected readonly cancelable = computed(
    () => this.franjas().length > 0 && this.franjas().every((f) => f.creado_manualmente),
  );

  protected etiquetaDia(dia: ReservaSemestral['dia']): string {
    return ETIQUETAS_DIA_SEMANA[dia];
  }

  protected franja(f: ReservaSemestral): string {
    return `${formatearHora(f.hora_inicio)} — ${formatearHora(f.hora_fin)}`;
  }

  protected confirmar(): void {
    const primera = this.primeraFranja();
    if (!primera || !this.cancelable()) {
      return;
    }

    this.reservasSemestralesService.cancelar.mutate(
      { grupoId: primera.grupo_id },
      {
        onSuccess: () => {
          this.visible.set(false);
          this.cancelada.emit();
          this.notificationService.success('Grupo cancelado');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo cancelar el grupo',
            extraerMensajeError(error, 'Intenta de nuevo.'),
          ),
      },
    );
  }

  protected cerrar(): void {
    this.visible.set(false);
  }
}
