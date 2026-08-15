import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';

import { NotificationService } from '../../core/shared/notification.service';
import { extraerMensajeError } from './programacion-error.util';
import { formatearFecha, type Semestre } from './programacion.models';
import { ProgramacionService } from './programacion.service';

/**
 * Vista de la feature `programacion` (Excel-import de la programación
 * académica, ver back/programacion/controller.py). Es la primera pantalla
 * de esta feature — el backend ya existía (`POST /importar`,
 * `GET /semestres`), pero no tenía frontend propio hasta acá.
 *
 * Nota de alcance — el backend NO expone edición ni borrado de un semestre
 * ya cargado (solo `GET /semestres` y la creación indirecta vía
 * `POST /importar`, ver el docblock de `programacion.models.ts`). Los
 * botones de editar/eliminar de cada tarjeta se muestran DESHABILITADOS con
 * tooltip explicando por qué, en vez de omitirse (para no dejar la UI coja
 * frente al mockup de referencia) o de llamar a un endpoint que no existe.
 *
 * Nota de alcance — el backend tampoco guarda metadata de auditoría de la
 * carga (ni fecha de importación ni usuario que la hizo): `SemestreOut` solo
 * trae `id`/`codigo`/`fecha_inicio`/`fecha_fin`. La línea "cargado el ... por
 * ..." del mockup de referencia NO se pinta acá por ese motivo — inventar esa
 * fecha/usuario sería peor que omitirla.
 *
 * El conteo de registros por tarjeta ("N registros") SÍ es real: se calcula
 * en el cliente agrupando `GET /api/programacion/` por `semestre_id`
 * (`ProgramacionService.programaciones`), porque el backend no expone ese
 * agregado por semestre.
 */
@Component({
  selector: 'app-programacion-list',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="programacion-list__header">
      <div>
        <h1 class="uco-page-header__title">
          <mat-icon inline class="programacion-list__titulo-icono">calendar_month</mat-icon>
          Programación académica
        </h1>
        <p class="uco-page-header__desc">
          {{ semestresService.semestres.data()?.length ?? 0 }} semestres cargados
        </p>
      </div>

      <button type="button" mat-raised-button color="primary" (click)="inputArchivo().nativeElement.click()">
        <mat-icon>upload_file</mat-icon>
        Importar Excel
      </button>
      <input
        #inputArchivoRef
        type="file"
        accept=".xlsx"
        class="programacion-list__input-oculto"
        (change)="onArchivoSeleccionado($event)"
      />
    </div>

    @if (semestresService.semestres.isPending()) {
      <p>Cargando semestres...</p>
    } @else if (semestresService.semestres.isError()) {
      <p role="alert">No se pudo cargar la lista de semestres. Intenta de nuevo.</p>
    } @else if ((semestresService.semestres.data()?.length ?? 0) === 0) {
      <p class="programacion-list__vacio">
        Aún no hay semestres cargados. Usa "Importar Excel" para cargar el primero.
      </p>
    } @else {
      <div class="programacion-list__grid">
        @for (semestre of semestresService.semestres.data() ?? []; track semestre.id) {
          <article class="programacion-list__tarjeta">
            <div class="programacion-list__tarjeta-acciones">
              <button
                type="button"
                mat-icon-button
                disabled
                matTooltip="No disponible: el backend no expone edición de semestres"
                aria-label="Editar semestre (no disponible)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                type="button"
                mat-icon-button
                disabled
                matTooltip="No disponible: el backend no expone eliminación de semestres"
                aria-label="Eliminar semestre (no disponible)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>

            <span class="programacion-list__codigo">{{ semestre.codigo }}</span>
            <span class="programacion-list__pill">{{ conteoRegistros(semestre.id) }} registros</span>

            <dl class="programacion-list__fechas">
              <div>
                <dt>Fecha inicio</dt>
                <dd>{{ formatearFecha(semestre.fecha_inicio) }}</dd>
              </div>
              <div>
                <dt>Fecha fin</dt>
                <dd>{{ formatearFecha(semestre.fecha_fin) }}</dd>
              </div>
            </dl>
          </article>
        }
      </div>
    }
  `,
  styles: `
    .programacion-list__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .programacion-list__titulo-icono {
      margin-right: 8px;
      vertical-align: -4px;
    }

    .programacion-list__input-oculto {
      display: none;
    }

    .programacion-list__vacio {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: var(--space-4);
    }

    .programacion-list__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--space-4);
    }

    .programacion-list__tarjeta {
      position: relative;
      background: #ffffff;
      border: var(--border-surface, 1px solid #e2e5e4);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .programacion-list__tarjeta-acciones {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 2px;
    }

    .programacion-list__codigo {
      font-family: Montserrat, sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #008b50;
    }

    .programacion-list__pill {
      align-self: flex-start;
      background: rgba(0, 139, 80, 0.12);
      color: #008b50;
      font-family: Poppins, sans-serif;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
    }

    .programacion-list__fechas {
      display: flex;
      gap: var(--space-4);
      margin: 8px 0 0;
    }

    .programacion-list__fechas dt {
      font-family: Montserrat, sans-serif;
      font-size: var(--font-size-xs);
      color: #6b7280;
    }

    .programacion-list__fechas dd {
      margin: 0;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
    }
  `,
})
export class ProgramacionListComponent {
  protected readonly semestresService = inject(ProgramacionService);
  private readonly notificationService = inject(NotificationService);

  protected readonly inputArchivo =
    viewChild.required<ElementRef<HTMLInputElement>>('inputArchivoRef');

  private readonly conteoPorSemestre = computed(() => {
    const filas = this.semestresService.programaciones.data() ?? [];
    const conteo = new Map<string, number>();
    for (const fila of filas) {
      conteo.set(fila.semestre_id, (conteo.get(fila.semestre_id) ?? 0) + 1);
    }
    return conteo;
  });

  protected conteoRegistros(semestreId: string): number {
    return this.conteoPorSemestre().get(semestreId) ?? 0;
  }

  protected formatearFecha(fecha: string): string {
    return formatearFecha(fecha);
  }

  protected onArchivoSeleccionado(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    // Limpia el input ya mismo: sin esto, volver a elegir EL MISMO archivo
    // dos veces seguidas no dispara `change` la segunda vez.
    input.value = '';
    if (!archivo) {
      return;
    }

    this.semestresService.importar.mutate(archivo, {
      onSuccess: (resultado) => this.mostrarResultadoImportacion(resultado.semestre, resultado),
      onError: (error) =>
        this.notificationService.error(
          'No se pudo importar el archivo',
          extraerMensajeError(error, 'Verifica que el archivo tenga el formato esperado.'),
        ),
    });
  }

  /** Resultado detallado vía SweetAlert2 (mismo criterio visual que
   * `NotificationService`/`ConfirmService`: colores institucionales, sin
   * introducir un componente de diálogo nuevo para un caso de uso único). */
  private mostrarResultadoImportacion(
    semestre: Semestre,
    resultado: { creadas: number; creadas_sin_docente: number; omitidas: { fila: number; motivo: string }[] },
  ): void {
    const listaOmitidas = resultado.omitidas.length
      ? `<ul style="text-align:left;max-height:180px;overflow-y:auto;margin:8px 0 0;padding-left:18px;">
          ${resultado.omitidas
            .map((omitida) => `<li>Fila ${omitida.fila}: ${escaparHtml(omitida.motivo)}</li>`)
            .join('')}
        </ul>`
      : '';

    void Swal.fire({
      icon: resultado.omitidas.length ? 'warning' : 'success',
      title: `Importación de ${semestre.codigo} completa`,
      html: `
        <p style="margin:0;">${resultado.creadas} registros creados
        (${resultado.creadas_sin_docente} sin docente asignado).</p>
        ${
          resultado.omitidas.length
            ? `<p style="margin:8px 0 0;">${resultado.omitidas.length} filas omitidas:</p>${listaOmitidas}`
            : ''
        }
      `,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#008b50',
    });
  }
}

function escaparHtml(texto: string): string {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}
