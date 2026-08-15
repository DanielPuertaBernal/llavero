import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';

import { PrestamoDetallesService } from './prestamo-detalles.service';
import { extraerMensajeError } from './prestamos-error.util';
import { PrestamosLookupsService } from './prestamos-lookups.service';
import { PrestamosService } from './prestamos.service';
import type { DevolucionInput, Prestamo } from './prestamos.models';

/**
 * Diálogo de DEVOLUCIÓN de equipos de un préstamo
 * (`POST /api/prestamos/{id}/devolver`, schema `DevolverEquiposIn` — ver
 * back/prestamos/controller.py). No edita el préstamo: dispara una
 * transición: devolver algunos equipos lo deja `parcialmente_devuelto`,
 * devolver los últimos lo deja `completamente_devuelto`.
 *
 * Nota de arquitectura — el diálogo provee su propia instancia de
 * `PrestamoDetallesService` (misma razón que la fila expandida, ver el
 * docblock de ese servicio): necesita los detalles del préstamo
 * seleccionado para saber qué equipos siguen `entregado`, y un singleton de
 * raíz con una sola señal `prestamoId` no puede servir a la vez a este
 * diálogo y a las filas expandidas de la tabla. Comparten caché por clave,
 * así que no se duplican peticiones.
 *
 * Nota de diseño — el multiselect ofrece SOLO los equipos todavía
 * `entregado`. Eso no es duplicar una regla de negocio: es no ofrecer una
 * opción que el propio préstamo ya declaró cerrada en su
 * `DetallePrestamoOut.estado_equipo`. Las reglas que sí son del backend (que
 * el equipo pertenezca al préstamo, que no esté ya devuelto por una carrera
 * entre pestañas) se dejan responder con su 400, que se muestra tal cual.
 *
 * Nota de diseño — `novedades_por_equipo` se OMITE del payload cuando ningún
 * equipo tiene novedad, y cuando la tiene solo incluye los equipos elegidos.
 * El schema lo declara `dict[...] | None = None`: mandar `{}` diría "hay un
 * mapa vacío", que no es lo mismo que "no hay novedades" y dependería de que
 * el backend trate ambos casos igual.
 *
 * Nota de diseño — la ubicación de devolución NO se ordena ni se filtra:
 * `Ubicacion` no tiene un flag `permite_devolucion_equipos` y
 * `service.devolver_equipos` no valida permiso alguno de ubicación al
 * recibir. Inventar acá esa restricción sería agregar una regla que el
 * dominio no tiene.
 */
@Component({
  selector: 'app-prestamo-devolucion-dialog',
  standalone: true,
  imports: [
    DialogModule,
    ReactiveFormsModule,
    FormsModule,
    SelectModule,
    MultiSelectModule,
    ButtonModule,
  ],
  providers: [PrestamoDetallesService],
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Devolver equipos"
      [modal]="true"
      [style]="{ width: '32rem' }"
    >
      @if (prestamo(); as prestamoActual) {
        <dl class="prestamo-devolucion-dialog__resumen">
          <dt>Solicitante</dt>
          <dd>{{ lookups.nombrePersona(prestamoActual.solicitante_id) }}</dd>
          <dt>Ubicación del préstamo</dt>
          <dd>{{ lookups.nombreUbicacion(prestamoActual.ubicacion_id) }}</dd>
        </dl>
      }

      <form [formGroup]="form" (ngSubmit)="guardar()" class="prestamo-devolucion-dialog__form">
        <div class="prestamo-devolucion-dialog__campo">
          <label for="devolucion-usuario">Usuario que recibe</label>
          <p-select
            id="devolucion-usuario"
            formControlName="usuario_recibe_id"
            [options]="lookups.opcionesUsuarios()"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona quién recibe"
          />
        </div>

        <div class="prestamo-devolucion-dialog__campo">
          <label for="devolucion-ubicacion">Ubicación de devolución</label>
          <p-select
            id="devolucion-ubicacion"
            formControlName="ubicacion_id"
            [options]="lookups.ubicacionesDevolucion()"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Selecciona la ubicación"
          />
        </div>

        <div class="prestamo-devolucion-dialog__campo">
          <label for="devolucion-equipos">Equipos a devolver</label>
          <p-multiselect
            id="devolucion-equipos"
            formControlName="equipo_ids"
            [options]="opcionesEquiposDevolver()"
            optionLabel="label"
            optionValue="value"
            display="chip"
            placeholder="Selecciona al menos un equipo"
          />
        </div>

        @for (equipoId of equiposSeleccionados(); track equipoId) {
          <div class="prestamo-devolucion-dialog__campo">
            <label [for]="'devolucion-novedad-' + equipoId">
              Novedad de {{ lookups.nombreEquipo(equipoId) }} (opcional)
            </label>
            <p-select
              [id]="'devolucion-novedad-' + equipoId"
              [options]="lookups.opcionesNovedades()"
              optionLabel="label"
              optionValue="value"
              [showClear]="true"
              placeholder="Sin novedad"
              [ngModel]="novedadDe(equipoId)"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="onNovedadChange(equipoId, $event)"
            />
          </div>
        }

        <footer class="prestamo-devolucion-dialog__acciones">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            [text]="true"
            (onClick)="cancelar()"
          />
          <p-button
            type="submit"
            label="Registrar devolución"
            [loading]="guardando()"
            [disabled]="form.invalid"
          />
        </footer>
      </form>
    </p-dialog>
  `,
  styles: `
    .prestamo-devolucion-dialog__resumen {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .prestamo-devolucion-dialog__resumen dd {
      margin: 0;
    }

    .prestamo-devolucion-dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .prestamo-devolucion-dialog__campo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .prestamo-devolucion-dialog__acciones {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class PrestamoDevolucionDialogComponent {
  readonly visible = model(false);
  readonly prestamo = input<Prestamo | null>(null);
  readonly guardado = output<void>();

  protected readonly lookups = inject(PrestamosLookupsService);
  protected readonly detallesService = inject(PrestamoDetallesService);
  private readonly prestamosService = inject(PrestamosService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    usuario_recibe_id: ['', Validators.required],
    ubicacion_id: ['', Validators.required],
    equipo_ids: this.fb.nonNullable.control<string[]>(
      [],
      [Validators.required, Validators.minLength(1)],
    ),
  });

  /**
   * `equipo_id -> novedad_id` de los equipos que el operador marcó con
   * novedad. Vive fuera del `FormGroup` (con `[ngModel]` standalone) porque
   * su forma depende de la selección del multiselect: agregar y quitar
   * controles del grupo en cada cambio de selección sería más frágil que un
   * único mapa, y este valor no participa de la validez del formulario — la
   * novedad es opcional.
   */
  protected readonly novedadesPorEquipo = signal<Record<string, string>>({});

  /** Los equipos elegidos, para renderizar un selector de novedad por cada uno. */
  protected readonly equiposSeleccionados = toSignal(this.form.controls.equipo_ids.valueChanges, {
    initialValue: this.form.controls.equipo_ids.value,
  });

  /**
   * Opciones del multiselect: solo los equipos que siguen `entregado` en
   * este préstamo. Se arma desde los ids del propio préstamo (no filtrando
   * el catálogo global) para que la lista sea correcta aunque el lookup de
   * equipos todavía no haya cargado — en ese caso la etiqueta cae al id
   * crudo, igual que en el resto de la feature.
   */
  protected readonly opcionesEquiposDevolver = computed(() =>
    this.detallesService.equiposEntregados().map((equipoId) => ({
      label: this.lookups.nombreEquipo(equipoId),
      value: equipoId,
    })),
  );

  protected readonly guardando = computed(() => this.prestamosService.devolverEquipos.isPending());

  constructor() {
    // Cada vez que cambia el préstamo a devolver: se apunta el servicio de
    // detalles al nuevo id (lo que habilita/rehace sus dos consultas) y el
    // formulario vuelve a cero. El diálogo es uno solo, reutilizado fila por
    // fila desde la tabla (mismo patrón que los diálogos de `llaves`).
    effect(() => {
      const prestamoActual = this.prestamo();
      this.detallesService.prestamoId.set(prestamoActual?.id ?? null);
      this.form.reset({ usuario_recibe_id: '', ubicacion_id: '', equipo_ids: [] });
      this.novedadesPorEquipo.set({});
    });
  }

  /** Novedad elegida para ese equipo, o `null` si no tiene — la forma que
   * `p-select` con `[showClear]` espera para mostrarse vacío. */
  protected novedadDe(equipoId: string): string | null {
    return this.novedadesPorEquipo()[equipoId] ?? null;
  }

  /** `null` (el `showClear` del selector) equivale a "sin novedad": se quita
   * la entrada del mapa en vez de guardar un valor vacío. */
  protected onNovedadChange(equipoId: string, novedadId: string | null): void {
    this.novedadesPorEquipo.update((mapa) => {
      const siguiente = { ...mapa };
      if (novedadId) {
        siguiente[equipoId] = novedadId;
      } else {
        delete siguiente[equipoId];
      }
      return siguiente;
    });
  }

  protected guardar(): void {
    const prestamoActual = this.prestamo();
    if (!prestamoActual || this.form.invalid) {
      return;
    }
    const valores = this.form.getRawValue();
    const mapa = this.novedadesPorEquipo();

    // Solo los equipos que (a) siguen seleccionados y (b) tienen novedad
    // elegida: si alguien marca una novedad y luego quita ese equipo del
    // multiselect, la entrada huérfana no debe viajar.
    const novedades = Object.fromEntries(
      valores.equipo_ids
        .filter((equipoId) => mapa[equipoId])
        .map((equipoId) => [equipoId, mapa[equipoId]]),
    );

    const payload: { id: string } & DevolucionInput = {
      id: prestamoActual.id,
      usuario_recibe_id: valores.usuario_recibe_id,
      ubicacion_id: valores.ubicacion_id,
      equipo_ids: valores.equipo_ids,
      // Ver la nota de diseño del docblock: la clave ni siquiera aparece
      // cuando ningún equipo tiene novedad.
      ...(Object.keys(novedades).length > 0 ? { novedades_por_equipo: novedades } : {}),
    };

    this.prestamosService.devolverEquipos.mutate(payload, {
      onSuccess: () => {
        this.visible.set(false);
        this.guardado.emit();
        this.messageService.add({ severity: 'success', summary: 'Devolución registrada' });
      },
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo registrar la devolución',
          detail: extraerMensajeError(error, 'Verifica los datos e intenta de nuevo.'),
        }),
    });
  }

  protected cancelar(): void {
    this.visible.set(false);
  }
}
