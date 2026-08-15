import { Component, computed, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ComunidadLookupsService } from './comunidad-lookups.service';
import { ComunidadService } from './comunidad.service';
import type { Persona } from './comunidad.models';

/**
 * Vista principal de Comunidad (RF26): el directorio de personas de la
 * universidad (docentes/estudiantes/empleados), incluyendo sus datos de
 * contacto (correo y numero de contacto).
 *
 * Nota de alcance -- SOLO LECTURA (ver comunidad.service.ts para la nota
 * completa de RF25/RF26): a diferencia de usuarios/monitores/novedades,
 * esta tabla-simple no tiene columna de acciones ni ningun boton "Nuevo" -- ni
 * crear ni eliminar tienen sentido en una UI que consulta un catalogo que
 * se sincroniza automaticamente desde el sistema institucional.
 *
 * Nota de diseño -- filtro de busqueda de CLIENTE, no de servidor: el
 * backend (back/comunidad/controller.py) solo expone busqueda EXACTA por
 * documento (GET /documento/{numero_documento}) o por carnet
 * (GET /carnet/{id_carnet}) -- ninguno de los dos sirve para un filtro de
 * tabla-simple tipo "contiene", que es lo que un campo de busqueda libre necesita.
 * Por eso el filtro es un `filter()` en memoria sobre `GET /` completo,
 * mismo criterio que `UsuariosListComponent` (ver su docblock) cuando el
 * backend no expone el endpoint de busqueda que el filtro necesitaria.
 *
 * Nota de diseño -- `tipo_persona_id` se resuelve a nombre legible via
 * `ComunidadLookupsService`, mismo patron que `UsuariosListComponent`
 * resuelve `rol_id`/`ubicacion_id`.
 *
 * Migración PrimeNG → Angular Material: `input[pInputText]` se reemplaza
 * por `<mat-form-field><input matInput></mat-form-field>` (con un icono de
 * búsqueda, `MatIconModule`, siguiendo el estilo "Input de búsqueda/texto"
 * de la especificación visual UCO) y `p-table` por una tabla-simple HTML simple
 * (esta vista no ordena ni pagina).
 */
@Component({
  selector: 'app-comunidad-list',
  standalone: true,
  imports: [MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <h1 class="uco-page-header__title">Comunidad</h1>
    <p class="uco-page-header__desc">Directorio de personas de la universidad.</p>

    <header class="comunidad-list__header">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="comunidad-list__buscador">
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          type="text"
          placeholder="Buscar por nombre o numero de documento..."
          aria-label="Buscar persona por nombre o numero de documento"
          (input)="onBusquedaChange($event)"
        />
      </mat-form-field>
    </header>

    @if (comunidadService.personas.isError()) {
      <p role="alert">No se pudieron cargar las personas de comunidad. Intenta de nuevo.</p>
    } @else if (cargando()) {
      <p>Cargando personas…</p>
    } @else {
      <table class="tabla-simple">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Numero de documento</th>
            <th>Tipo de persona</th>
            <th>Correo</th>
            <th>Numero de contacto</th>
            <th>Facultad</th>
            <th>Carnet</th>
          </tr>
        </thead>
        <tbody>
          @for (persona of personasFiltradas(); track persona.id) {
            <tr>
              <td>{{ persona.nombre }}</td>
              <td>{{ persona.numero_documento }}</td>
              <td>{{ lookups.nombreTipoPersona(persona.tipo_persona_id) }}</td>
              <td>{{ persona.correo ?? '—' }}</td>
              <td>{{ persona.numero_contacto ?? '—' }}</td>
              <td>{{ persona.facultad ?? '—' }}</td>
              <td>{{ persona.id_carnet ?? '—' }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7" class="tabla-simple-simple__estado-vacio">
                <mat-icon class="tabla-simple-simple__estado-vacio-icono">groups</mat-icon>
                <br />
                No hay personas que coincidan con el filtro.
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    .comunidad-list__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .comunidad-list__buscador {
      width: 100%;
      max-width: 28rem;
    }

  `,
})
export class ComunidadListComponent {
  protected readonly comunidadService = inject(ComunidadService);
  protected readonly lookups = inject(ComunidadLookupsService);

  protected readonly busqueda = signal('');

  protected readonly cargando = computed(() => this.comunidadService.personas.isPending());

  protected readonly personasFiltradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    if (!termino) {
      return this.comunidadService.personas.data() ?? [];
    }
    return (this.comunidadService.personas.data() ?? []).filter((persona: Persona) =>
      coincideBusqueda(persona, termino),
    );
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }
}

function coincideBusqueda(persona: Persona, termino: string): boolean {
  return (
    persona.nombre.toLowerCase().includes(termino) ||
    persona.numero_documento.toLowerCase().includes(termino)
  );
}
