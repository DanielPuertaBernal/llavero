import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import {
  NotificacionFormDialogComponent,
  type NotificacionPrecarga,
} from './notificacion-form-dialog.component';
import { NotificacionesLookupsService } from './notificaciones-lookups.service';
import { NotificacionesService } from './notificaciones.service';
import {
  ETIQUETAS_ESTADO_ENVIO,
  ETIQUETAS_TIPO_NOTIFICACION,
  OPCIONES_ESTADO_ENVIO,
  OPCIONES_TIPO_NOTIFICACION,
  type EstadoEnvioNotificacion,
  type Notificacion,
  type TipoNotificacion,
} from './notificaciones.models';

/** Clase de badge de estado por estado de envío: un fallo es lo que el
 * operador necesita ver destacado (es el disparador de "Reenviar", RF24).
 * Ver "Badge de estado" en
 * `DOC/5. Identidad Visual/Mockups/00-especificacion-visual.md`. */
const CLASE_BADGE_ESTADO_ENVIO: Record<EstadoEnvioNotificacion, string> = {
  enviado: 'badge badge--exito',
  fallido: 'badge badge--peligro',
};

/**
 * Vista principal de Notificaciones: el registro de mensajes enviados a
 * personas de `comunidad` (ver back/notificaciones/model.py).
 *
 * A diferencia de `reservas`/`prestamos`/`llaves`, esta feature NO tiene
 * ciclo de vida de estado sobre una fila existente: no hay "cerrar",
 * "cancelar" ni "desactivar" — `estado_envio` lo decide el backend al
 * intentar el envío SMTP, nunca una acción del operador sobre una fila ya
 * creada (ver docstring de `NotificacionesService`). Por eso la columna de
 * acciones solo tiene "Reenviar", y solo aparece en las filas `fallido`.
 *
 * Dos botones de envío en el encabezado, uno por cada acción de creación que
 * expone la UI (ver la nota de diseño completa en
 * `NotificacionesService`/`notificacion-form-dialog.component.ts` sobre por
 * qué `/vencimiento` no se expone):
 *
 * - "Enviar notificación" abre el diálogo en modo `'manual'`, sin precarga.
 * - "Enviar recordatorio" abre el mismo diálogo en modo `'recordatorio'`.
 *
 * Nota de diseño — "Reenviar" (RF24: "reenviar notificaciones fallidas"): el
 * backend no expone un endpoint de reenvío (confirmado, no existe en
 * back/notificaciones/controller.py) ni forma de mutar una notificación
 * existente. Se implementa abriendo el mismo diálogo de envío en modo
 * `'manual'`, con `precarga` poblada desde la fila fallida (destinatario,
 * asunto, mensaje) — el operador revisa/ajusta y confirma, disparando un
 * `POST /manual` que crea una fila NUEVA. La fila fallida original queda
 * intacta en la lista, como registro histórico de ese intento.
 *
 * Nota de diseño — dos filtros de SERVIDOR (tipo, estado de envío),
 * mutuamente excluyentes, mismo patrón que `ReservasListComponent`
 * (solicitante/estado): `GET /api/notificaciones/tipo/{tipo}` y `GET
 * /api/notificaciones/estado-envio/{estado_envio}` son endpoints propios, así
 * que elegir uno cambia la consulta en `NotificacionesService`, no filtra la
 * lista ya descargada. Elegir un tipo limpia el filtro de estado de envío y
 * viceversa, porque el backend no expone un endpoint combinado.
 *
 * Migración PrimeNG → Angular Material: `p-toast`/`MessageService` se
 * reemplazan por `NotificationService` (SweetAlert2, ver
 * `core/shared/notification.service.ts`), `p-select` por `mat-select`,
 * `p-button` por `button[mat-button]`/`button[mat-raised-button]`, `p-table`
 * por una tabla-simple HTML simple (sin sorting/paginación real, no hacía falta
 * `MatTableModule`) y `p-tag` por un badge propio con los colores de estado
 * de la especificación visual UCO.
 */
@Component({
  selector: 'app-notificaciones-list',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    NotificacionFormDialogComponent,
  ],
  template: `
    <h1 class="uco-page-header__title">Notificaciones</h1>
    <p class="uco-page-header__desc">Mensajes enviados a personas de la comunidad.</p>

    <header class="notificaciones-list__header">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Tipo</mat-label>
        <mat-select
          [ngModel]="notificacionesService.filtroTipo()"
          (ngModelChange)="onTipoChange($event)"
          aria-label="Filtrar por tipo"
          placeholder="Todos los tipos"
        >
          @for (opcion of opcionesTipo; track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Estado de envío</mat-label>
        <mat-select
          [ngModel]="notificacionesService.filtroEstadoEnvio()"
          (ngModelChange)="onEstadoEnvioChange($event)"
          aria-label="Filtrar por estado de envío"
          placeholder="Todos los estados"
        >
          @for (opcion of opcionesEstadoEnvio; track opcion.value) {
            <mat-option [value]="opcion.value">{{ opcion.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button mat-stroked-button type="button" (click)="abrirRecordatorio()">
        <mat-icon>notifications</mat-icon>
        Enviar recordatorio
      </button>
      <button mat-raised-button color="primary" type="button" (click)="abrirEnvioManual()">
        <mat-icon>send</mat-icon>
        Enviar notificación
      </button>
    </header>

    @if (notificacionesService.notificaciones.isError()) {
      <p role="alert">No se pudieron cargar las notificaciones. Intenta de nuevo.</p>
    } @else if (cargando()) {
      <p>Cargando notificaciones…</p>
    } @else {
      <table class="tabla-simple">
        <thead>
          <tr>
            <th>Destinatario</th>
            <th>Tipo</th>
            <th>Asunto</th>
            <th>Mensaje</th>
            <th>Estado de envío</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (notificacion of notificaciones(); track notificacion.id) {
            <tr>
              <td>{{ lookups.nombrePersona(notificacion.destinatario_id) }}</td>
              <td>{{ etiquetaTipo(notificacion.tipo) }}</td>
              <td>{{ notificacion.asunto ?? '—' }}</td>
              <td>{{ notificacion.mensaje ?? '—' }}</td>
              <td>
                <span [class]="claseBadgeEstadoEnvio(notificacion.estado_envio)">
                  {{ etiquetaEstadoEnvio(notificacion.estado_envio) }}
                </span>
              </td>
              <td>
                @if (notificacion.estado_envio === 'fallido') {
                  <button
                    mat-button
                    type="button"
                    (click)="abrirReenvio(notificacion)"
                    aria-label="Reenviar notificación"
                  >
                    <mat-icon>refresh</mat-icon>
                    Reenviar
                  </button>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="tabla-simple-simple__estado-vacio">
                <mat-icon class="tabla-simple-simple__estado-vacio-icono">notifications</mat-icon>
                <br />
                No hay notificaciones registradas para este filtro.
              </td>
            </tr>
          }
        </tbody>
      </table>
    }

    <app-notificacion-form-dialog
      [(visible)]="formDialogVisible"
      [modo]="dialogModo()"
      [precarga]="notificacionAReenviar()"
    />
  `,
  styles: `
    .notificaciones-list__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 10px;
      font-family: Poppins, sans-serif;
      font-size: 11px;
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
export class NotificacionesListComponent {
  protected readonly notificacionesService = inject(NotificacionesService);
  protected readonly lookups = inject(NotificacionesLookupsService);

  protected readonly opcionesTipo: { label: string; value: TipoNotificacion | null }[] = [
    { label: 'Todos los tipos', value: null },
    ...OPCIONES_TIPO_NOTIFICACION,
  ];

  protected readonly opcionesEstadoEnvio: {
    label: string;
    value: EstadoEnvioNotificacion | null;
  }[] = [{ label: 'Todos los estados', value: null }, ...OPCIONES_ESTADO_ENVIO];

  protected readonly formDialogVisible = signal(false);
  protected readonly dialogModo = signal<'manual' | 'recordatorio'>('manual');
  protected readonly notificacionAReenviar = signal<NotificacionPrecarga | null>(null);

  protected readonly cargando = computed(() =>
    this.notificacionesService.notificaciones.isPending(),
  );

  protected readonly notificaciones = computed(
    () => this.notificacionesService.notificaciones.data() ?? [],
  );

  protected onTipoChange(tipo: TipoNotificacion | null): void {
    this.notificacionesService.filtroTipo.set(tipo);
    this.notificacionesService.filtroEstadoEnvio.set(null);
  }

  protected onEstadoEnvioChange(estadoEnvio: EstadoEnvioNotificacion | null): void {
    this.notificacionesService.filtroEstadoEnvio.set(estadoEnvio);
    this.notificacionesService.filtroTipo.set(null);
  }

  protected etiquetaTipo(tipo: TipoNotificacion): string {
    return ETIQUETAS_TIPO_NOTIFICACION[tipo];
  }

  protected etiquetaEstadoEnvio(estado: EstadoEnvioNotificacion): string {
    return ETIQUETAS_ESTADO_ENVIO[estado];
  }

  protected claseBadgeEstadoEnvio(estado: EstadoEnvioNotificacion): string {
    return CLASE_BADGE_ESTADO_ENVIO[estado];
  }

  protected abrirEnvioManual(): void {
    this.dialogModo.set('manual');
    this.notificacionAReenviar.set(null);
    this.formDialogVisible.set(true);
  }

  protected abrirRecordatorio(): void {
    this.dialogModo.set('recordatorio');
    this.notificacionAReenviar.set(null);
    this.formDialogVisible.set(true);
  }

  protected abrirReenvio(notificacion: Notificacion): void {
    this.dialogModo.set('manual');
    this.notificacionAReenviar.set({
      destinatario_id: notificacion.destinatario_id,
      asunto: notificacion.asunto ?? '',
      mensaje: notificacion.mensaje ?? '',
    });
    this.formDialogVisible.set(true);
  }
}
