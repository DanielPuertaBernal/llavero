import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ConfirmService } from '../../../core/shared/confirm.service';
import { NotificationService } from '../../../core/shared/notification.service';
import { extraerMensajeError } from '../catalogos-error.util';
import type { Bloque } from '../catalogos.models';
import { BloquesService } from '../bloques/bloques.service';

/**
 * CRUD del catálogo de apoyo `Bloque`, pensado para vivir dentro de un
 * diálogo de Material lanzado desde la vista de Salones (ver
 * salones-list.component.ts) — NO tiene ruta propia, igual que en el
 * frontend legacy (ver AulaSync/analisis/frontend/catalogos.md §1).
 *
 * No re-provee `NotificationService`/`ConfirmService`: ambos son
 * `providedIn: 'root'`, así que comparte instancia con el resto de la app
 * (toasts/confirmaciones globales de SweetAlert2), en vez de tener su
 * propio popup duplicado — mismo criterio que el `p-toast`/
 * `p-confirmdialog` únicos que tenía el componente padre antes de esta
 * migración.
 *
 * Eliminar NO hace ningún chequeo "¿está en uso?" del lado cliente (a
 * diferencia del legacy, ver catalogos.md §6/§8) — se confía en el 400 que
 * el backend ya devuelve si el bloque sigue referenciado por un salón.
 */
@Component({
  selector: 'app-bloques-manager',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <form [formGroup]="formNuevo" (ngSubmit)="agregar()" class="bloques-manager__form-nuevo">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Nombre del bloque nuevo</mat-label>
        <input matInput type="text" formControlName="nombre" aria-label="Nombre del bloque nuevo" />
      </mat-form-field>
      <button
        type="submit"
        mat-raised-button
        color="primary"
        [disabled]="formNuevo.invalid || bloquesService.crear.isPending()"
      >
        <mat-icon>add</mat-icon>
        Agregar
      </button>
    </form>

    <table class="tabla-simple">
      <thead>
        <tr>
          <th>Nombre</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @if (bloquesService.bloques.isPending()) {
          <tr>
            <td colspan="2" class="tabla-simple__estado-vacio">Cargando...</td>
          </tr>
        } @else if ((bloquesService.bloques.data() ?? []).length === 0) {
          <tr>
            <td colspan="2" class="tabla-simple__estado-vacio">No hay bloques registrados.</td>
          </tr>
        } @else {
          @for (bloque of bloquesService.bloques.data() ?? []; track bloque.id) {
            @if (editandoId() === bloque.id) {
              <tr>
                <td>
                  <form [formGroup]="formEdicion" (ngSubmit)="guardarEdicion(bloque.id)">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <input matInput type="text" formControlName="nombre" aria-label="Nombre del bloque" />
                    </mat-form-field>
                  </form>
                </td>
                <td>
                  <button
                    type="button"
                    mat-icon-button
                    [disabled]="formEdicion.invalid"
                    (click)="guardarEdicion(bloque.id)"
                    aria-label="Guardar"
                  >
                    <mat-icon>check</mat-icon>
                  </button>
                  <button type="button" mat-icon-button (click)="cancelarEdicion()" aria-label="Cancelar">
                    <mat-icon>close</mat-icon>
                  </button>
                </td>
              </tr>
            } @else {
              <tr>
                <td>{{ bloque.nombre }}</td>
                <td>
                  <button type="button" mat-icon-button (click)="iniciarEdicion(bloque)" aria-label="Editar">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    type="button"
                    mat-icon-button
                    class="boton-peligro"
                    (click)="confirmarEliminar(bloque)"
                    aria-label="Eliminar"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </tr>
            }
          }
        }
      </tbody>
    </table>

    @if (bloquesService.bloques.isError()) {
      <p role="alert">No se pudieron cargar los bloques. Intenta de nuevo.</p>
    }
  `,
  styles: `
    .bloques-manager__form-nuevo {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .tabla-simple {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }

    .tabla-simple th {
      background: #f5f7f6;
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 12px;
      font-weight: 700;
      color: #1a1a1a;
      text-align: left;
      padding: 10px;
    }

    .tabla-simple td {
      border: 1px solid #e2e5e4;
      font-family: Montserrat, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      padding: 10px;
    }

    .tabla-simple__estado-vacio {
      text-align: center;
      font-family: Montserrat, sans-serif;
      font-style: italic;
      color: #6b7280;
      padding: 24px;
    }

    .boton-peligro {
      color: #e28210;
    }
  `,
})
export class BloquesManagerComponent {
  protected readonly bloquesService = inject(BloquesService);
  private readonly confirmService = inject(ConfirmService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly editandoId = signal<string | null>(null);

  protected readonly formNuevo = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly formEdicion = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected agregar(): void {
    if (this.formNuevo.invalid) {
      return;
    }
    const nombre = this.formNuevo.getRawValue().nombre.trim();
    this.bloquesService.crear.mutate(
      { nombre },
      {
        onSuccess: () => {
          this.formNuevo.reset();
          this.notificationService.success('Bloque creado');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo crear el bloque',
            extraerMensajeError(error, 'Intenta de nuevo.'),
          ),
      },
    );
  }

  protected iniciarEdicion(bloque: Bloque): void {
    this.editandoId.set(bloque.id);
    this.formEdicion.setValue({ nombre: bloque.nombre });
  }

  protected cancelarEdicion(): void {
    this.editandoId.set(null);
  }

  protected guardarEdicion(id: string): void {
    if (this.formEdicion.invalid) {
      return;
    }
    const nombre = this.formEdicion.getRawValue().nombre.trim();
    this.bloquesService.actualizar.mutate(
      { id, nombre },
      {
        onSuccess: () => {
          this.editandoId.set(null);
          this.notificationService.success('Bloque actualizado');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo actualizar el bloque',
            extraerMensajeError(error, 'Intenta de nuevo.'),
          ),
      },
    );
  }

  protected async confirmarEliminar(bloque: Bloque): Promise<void> {
    const confirmado = await this.confirmService.confirmar({
      titulo: 'Eliminar bloque',
      mensaje: `¿Eliminar el bloque "${bloque.nombre}"?`,
      peligro: true,
      textoAceptar: 'Eliminar',
      textoCancelar: 'Cancelar',
    });
    if (confirmado) {
      this.eliminar(bloque.id);
    }
  }

  private eliminar(id: string): void {
    this.bloquesService.eliminar.mutate(id, {
      onSuccess: () => this.notificationService.success('Bloque eliminado'),
      onError: (error) =>
        this.notificationService.error(
          'No se pudo eliminar el bloque',
          extraerMensajeError(error, 'Intenta de nuevo.'),
        ),
    });
  }
}
