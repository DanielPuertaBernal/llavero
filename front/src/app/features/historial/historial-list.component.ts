import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { HistorialLookupsService } from './historial-lookups.service';
import { HistorialService } from './historial.service';
import type { EventoHistorial, TipoEvento, TipoRecurso } from './historial.models';

/**
 * Vista principal de Historial (RF27: historial de entregas/devoluciones de
 * llaves y equipos; RF28: Portero ve solo lo que él procesó,
 * Administrador/Auxiliar ven todo).
 *
 * Nota de alcance -- SOLO LECTURA (mismo criterio que
 * `ComunidadListComponent`/`DisponibilidadVistaComponent`): no hay ninguna
 * columna de acciones ni ningún botón "Nuevo" -- el historial nace de las
 * transiciones de otros módulos (llaves, prestamos), nunca se crea ni se
 * edita desde acá. Tampoco hay selector de salón/fecha como en
 * `disponibilidad`: la lista ya llega ordenada por `fecha_hora` descendente
 * desde el backend (ver historial.service.ts) y esta vista NUNCA la
 * reordena.
 *
 * Nota de diseño -- RF28, el aviso de Portero: cuando `HistorialService.
 * esPortero()` es `true` (rol Portero, o resolución de rol fallida -- ver la
 * nota "fail-SAFE" en historial.service.ts), se muestra un aviso explícito
 * ("Mostrando solo tus registros") en vez de dejarlo implícito en un
 * subconjunto silencioso de filas: quien usa la vista debe poder distinguir
 * "no hay más eventos" de "solo ves los tuyos".
 *
 * Nota de diseño -- columna "detalle" COMPUESTA en vez de columnas separadas
 * por tipo de recurso: esta es la PRIMERA feature del proyecto con filas
 * heterogéneas (`tipo_recurso: 'llave' | 'equipo'`, ver historial.models.ts)
 * -- ninguna feature anterior (`llaves`, `prestamos`, `disponibilidad`, etc.)
 * tenía este problema, así que no hay precedente que replicar. Se descartó
 * declarar una columna por cada campo posible (salón/docente titular/
 * reclamado por/solicitante/equipos) porque la mitad quedaría vacía
 * ("—") en cada fila según el tipo de recurso, produciendo una tabla ancha y
 * dispersa. En su lugar, `detalle(evento)` arma un solo texto legible por
 * fila, condicionado a `tipo_recurso` -- más compacto y más fácil de leer de
 * un vistazo que una fila a medio llenar.
 *
 * Migrado de PrimeNG a Angular Material: tabla HTML simple (solo lectura,
 * sin sorting/paginación real) y badges propios en vez de `p-tag`.
 */
@Component({
  selector: 'app-historial-list',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <h1 class="uco-page-header__title">Historial</h1>
    <p class="uco-page-header__desc">Registro de entregas y devoluciones de llaves y equipos.</p>

    @if (historialService.esPortero()) {
      <span class="badge badge--info">Mostrando solo tus registros</span>
    }

    @if (historialService.eventos.isError()) {
      <p role="alert">No se pudo cargar el historial. Intenta de nuevo.</p>
    }

    <table class="tabla-simple">
      <thead>
        <tr>
          <th>Fecha y hora</th>
          <th>Tipo de recurso</th>
          <th>Tipo de evento</th>
          <th>Procesado por</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        @if (cargando()) {
          <tr>
            <td colspan="5" class="tabla-simple__estado-vacio">Cargando...</td>
          </tr>
        } @else if (eventos().length === 0) {
          <tr>
            <td colspan="5" class="tabla-simple__estado-vacio">
              <mat-icon class="tabla-simple__estado-vacio-icono">history</mat-icon>
              <br />
              No hay eventos de historial para mostrar.
            </td>
          </tr>
        } @else {
          @for (evento of eventos(); track $index) {
            <tr>
              <td>{{ evento.fecha_hora | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>
                <span class="badge" [class]="claseBadgeRecurso(evento.tipo_recurso)">
                  {{ etiquetaRecurso(evento.tipo_recurso) }}
                </span>
              </td>
              <td>
                <span class="badge" [class]="claseBadgeEvento(evento.tipo_evento)">
                  {{ etiquetaEvento(evento.tipo_evento) }}
                </span>
              </td>
              <td>{{ lookups.nombreUsuario(evento.procesado_por_id) }}</td>
              <td>{{ detalle(evento) }}</td>
            </tr>
          }
        }
      </tbody>
    </table>
  `,
  styles: `
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 12px;
      font-family: Poppins, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: var(--space-2);
    }

    .badge--exito {
      background: #008b50;
    }

    .badge--info {
      background: #04b5ac;
    }

    .badge--atencion {
      background: #ffca00;
      color: #1a1a1a;
    }
  `,
})
export class HistorialListComponent {
  protected readonly historialService = inject(HistorialService);
  protected readonly lookups = inject(HistorialLookupsService);

  protected readonly cargando = computed(() => this.historialService.eventos.isPending());

  protected readonly eventos = computed(() => this.historialService.eventos.data() ?? []);

  protected claseBadgeRecurso(tipoRecurso: TipoRecurso): string {
    // Llave = info (neutro), equipo = atención -- solo para distinguir de un
    // vistazo el origen del evento, sin implicar que uno sea "peor" que el
    // otro (mismo espíritu que la severidad de `disponibilidad-vista` por
    // origen de ocupación).
    return tipoRecurso === 'llave' ? 'badge--info' : 'badge--atencion';
  }

  protected etiquetaRecurso(tipoRecurso: TipoRecurso): string {
    return tipoRecurso === 'llave' ? 'Llave' : 'Equipo';
  }

  protected claseBadgeEvento(tipoEvento: TipoEvento): string {
    // Entrega = éxito (el recurso sale), devolución = info (el recurso
    // vuelve) -- ninguna de las dos es un estado de alerta.
    return tipoEvento === 'entrega' ? 'badge--exito' : 'badge--info';
  }

  protected etiquetaEvento(tipoEvento: TipoEvento): string {
    return tipoEvento === 'entrega' ? 'Entrega' : 'Devolución';
  }

  /**
   * Arma el texto de la columna "detalle" según `tipo_recurso` (ver la nota
   * de diseño del docblock de la clase para por qué es una sola columna
   * compuesta en vez de columnas separadas por tipo).
   */
  protected detalle(evento: EventoHistorial): string {
    if (evento.tipo_recurso === 'llave') {
      const salon = evento.salon_id ? this.lookups.nombreSalon(evento.salon_id) : '—';
      const docenteTitular = evento.docente_titular_id
        ? this.lookups.nombrePersona(evento.docente_titular_id)
        : '—';
      const reclamadoPor = evento.reclamado_por_id
        ? this.lookups.nombrePersona(evento.reclamado_por_id)
        : '—';
      return `Salón: ${salon} · Docente titular: ${docenteTitular} · Reclamado por: ${reclamadoPor}`;
    }

    const solicitante = evento.solicitante_id
      ? this.lookups.nombrePersona(evento.solicitante_id)
      : '—';
    const equipos = this.lookups.nombresEquipos(evento.equipo_ids) ?? '—';
    return `Solicitante: ${solicitante} · Equipos: ${equipos}`;
  }
}
