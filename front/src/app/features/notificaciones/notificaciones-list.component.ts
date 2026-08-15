import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

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

/** Severidad de `p-tag` por estado de envío: un fallo es lo que el operador
 * necesita ver destacado (es el disparador de "Reenviar", RF24). */
const SEVERIDAD_ESTADO_ENVIO: Record<EstadoEnvioNotificacion, 'success' | 'danger'> = {
  enviado: 'success',
  fallido: 'danger',
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
 */
@Component({
  selector: 'app-notificaciones-list',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    TagModule,
    ToastModule,
    NotificacionFormDialogComponent,
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <header class="notificaciones-list__header">
      <p-select
        [options]="opcionesTipo"
        optionLabel="label"
        optionValue="value"
        [ngModel]="notificacionesService.filtroTipo()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onTipoChange($event)"
        ariaLabel="Filtrar por tipo"
        placeholder="Todos los tipos"
      />
      <p-select
        [options]="opcionesEstadoEnvio"
        optionLabel="label"
        optionValue="value"
        [ngModel]="notificacionesService.filtroEstadoEnvio()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onEstadoEnvioChange($event)"
        ariaLabel="Filtrar por estado de envío"
        placeholder="Todos los estados"
      />
      <p-button label="Enviar recordatorio" severity="secondary" (onClick)="abrirRecordatorio()" />
      <p-button label="Enviar notificación" icon="pi pi-send" (onClick)="abrirEnvioManual()" />
    </header>

    @if (notificacionesService.notificaciones.isError()) {
      <p role="alert">No se pudieron cargar las notificaciones. Intenta de nuevo.</p>
    }

    <p-table [value]="notificaciones()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Destinatario</th>
          <th>Tipo</th>
          <th>Asunto</th>
          <th>Mensaje</th>
          <th>Estado de envío</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-notificacion>
        <tr>
          <td>{{ lookups.nombrePersona(notificacion.destinatario_id) }}</td>
          <td>{{ etiquetaTipo(notificacion.tipo) }}</td>
          <td>{{ notificacion.asunto ?? '—' }}</td>
          <td>{{ notificacion.mensaje ?? '—' }}</td>
          <td>
            <p-tag
              [severity]="severidadEstadoEnvio(notificacion.estado_envio)"
              [value]="etiquetaEstadoEnvio(notificacion.estado_envio)"
            />
          </td>
          <td>
            @if (notificacion.estado_envio === 'fallido') {
              <p-button
                label="Reenviar"
                [text]="true"
                (onClick)="abrirReenvio(notificacion)"
                ariaLabel="Reenviar notificación"
              />
            }
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="6">No hay notificaciones registradas para este filtro.</td>
        </tr>
      </ng-template>
    </p-table>

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

  protected severidadEstadoEnvio(estado: EstadoEnvioNotificacion): 'success' | 'danger' {
    return SEVERIDAD_ESTADO_ENVIO[estado];
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
