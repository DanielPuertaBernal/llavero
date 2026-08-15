import { Component, computed, inject, input, model, output } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

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
 */
@Component({
  selector: 'app-reserva-semestral-cancelacion-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule, TagModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Cancelar grupo de reserva semestral"
      [modal]="true"
      [style]="{ width: '30rem' }"
    >
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
                <p-tag severity="secondary" value="institucional" />
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

      <footer class="reserva-semestral-cancelacion-dialog__acciones">
        <p-button
          type="button"
          label="Volver"
          severity="secondary"
          [text]="true"
          (onClick)="cerrar()"
        />
        <p-button
          type="button"
          label="Cancelar grupo"
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
    .reserva-semestral-cancelacion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .reserva-semestral-cancelacion-dialog__resumen dd {
      margin: 0;
    }

    .reserva-semestral-cancelacion-dialog__franjas {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: var(--space-2) 0;
      padding-left: var(--space-4);
    }

    .reserva-semestral-cancelacion-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-4);
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
  private readonly messageService = inject(MessageService);

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
          this.messageService.add({ severity: 'success', summary: 'Grupo cancelado' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo cancelar el grupo',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
      },
    );
  }

  protected cerrar(): void {
    this.visible.set(false);
  }
}
