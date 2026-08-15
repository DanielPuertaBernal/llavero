import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ConfirmService } from '../../../core/shared/confirm.service';
import { NotificationService } from '../../../core/shared/notification.service';
import { extraerMensajeError } from '../catalogos-error.util';
import type { TipoSilleteria } from '../catalogos.models';
import { TiposSilleteriaService } from '../tipos-silleteria/tipos-silleteria.service';

/**
 * CRUD del catálogo de apoyo `TipoSilleteria` — mismo patrón que
 * `BloquesManagerComponent` (ver su docstring): vive dentro de un diálogo
 * de Material de la vista de Salones, reutiliza el `NotificationService`/
 * `ConfirmService` únicos de la app (ambos `providedIn: 'root'`), y no hace
 * ningún chequeo "¿está en uso?" del lado cliente (se confía en el 400 del
 * backend).
 */
@Component({
  selector: 'app-tipos-silleteria-manager',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <form [formGroup]="formNuevo" (ngSubmit)="agregar()" class="tipos-silleteria-manager__form-nuevo">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Nombre del tipo de silletería nuevo</mat-label>
        <input matInput type="text" formControlName="nombre" aria-label="Nombre del tipo de silletería nuevo" />
      </mat-form-field>
      <button
        type="submit"
        mat-raised-button
        color="primary"
        [disabled]="formNuevo.invalid || tiposSilleteriaService.crear.isPending()"
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
        @if (tiposSilleteriaService.tiposSilleteria.isPending()) {
          <tr>
            <td colspan="2" class="tabla-simple__estado-vacio">Cargando...</td>
          </tr>
        } @else if ((tiposSilleteriaService.tiposSilleteria.data() ?? []).length === 0) {
          <tr>
            <td colspan="2" class="tabla-simple__estado-vacio">
              <mat-icon class="tabla-simple__estado-vacio-icono">list</mat-icon>
              <br />
              No hay tipos de silletería registrados.
            </td>
          </tr>
        } @else {
          @for (tipo of tiposSilleteriaService.tiposSilleteria.data() ?? []; track tipo.id) {
            @if (editandoId() === tipo.id) {
              <tr>
                <td>
                  <form [formGroup]="formEdicion" (ngSubmit)="guardarEdicion(tipo.id)">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <input matInput type="text" formControlName="nombre" aria-label="Nombre del tipo de silletería" />
                    </mat-form-field>
                  </form>
                </td>
                <td>
                  <button
                    type="button"
                    mat-icon-button
                    [disabled]="formEdicion.invalid"
                    (click)="guardarEdicion(tipo.id)"
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
                <td>{{ tipo.nombre }}</td>
                <td>
                  <button type="button" mat-icon-button (click)="iniciarEdicion(tipo)" aria-label="Editar">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    type="button"
                    mat-icon-button
                    class="boton-peligro"
                    (click)="confirmarEliminar(tipo)"
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

    @if (tiposSilleteriaService.tiposSilleteria.isError()) {
      <p role="alert">No se pudieron cargar los tipos de silletería. Intenta de nuevo.</p>
    }
  `,
  styles: `
    .tipos-silleteria-manager__form-nuevo {
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

    .tabla-simple__estado-vacio-icono {
      color: #9ca3af;
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 4px;
    }

    .boton-peligro {
      color: #e28210;
    }
  `,
})
export class TiposSilleteriaManagerComponent {
  protected readonly tiposSilleteriaService = inject(TiposSilleteriaService);
  private readonly confirmService = inject(ConfirmService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly editandoId = signal<string | null>(null);

  protected readonly formNuevo = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(50)]],
  });

  protected readonly formEdicion = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(50)]],
  });

  protected agregar(): void {
    if (this.formNuevo.invalid) {
      return;
    }
    const nombre = this.formNuevo.getRawValue().nombre.trim();
    this.tiposSilleteriaService.crear.mutate(
      { nombre },
      {
        onSuccess: () => {
          this.formNuevo.reset();
          this.notificationService.success('Tipo de silletería creado');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo crear el tipo de silletería',
            extraerMensajeError(error, 'Intenta de nuevo.'),
          ),
      },
    );
  }

  protected iniciarEdicion(tipo: TipoSilleteria): void {
    this.editandoId.set(tipo.id);
    this.formEdicion.setValue({ nombre: tipo.nombre });
  }

  protected cancelarEdicion(): void {
    this.editandoId.set(null);
  }

  protected guardarEdicion(id: string): void {
    if (this.formEdicion.invalid) {
      return;
    }
    const nombre = this.formEdicion.getRawValue().nombre.trim();
    this.tiposSilleteriaService.actualizar.mutate(
      { id, nombre },
      {
        onSuccess: () => {
          this.editandoId.set(null);
          this.notificationService.success('Tipo de silletería actualizado');
        },
        onError: (error) =>
          this.notificationService.error(
            'No se pudo actualizar el tipo de silletería',
            extraerMensajeError(error, 'Intenta de nuevo.'),
          ),
      },
    );
  }

  protected async confirmarEliminar(tipo: TipoSilleteria): Promise<void> {
    const confirmado = await this.confirmService.confirmar({
      titulo: 'Eliminar tipo de silletería',
      mensaje: `¿Eliminar el tipo de silletería "${tipo.nombre}"?`,
      peligro: true,
      textoAceptar: 'Eliminar',
      textoCancelar: 'Cancelar',
    });
    if (confirmado) {
      this.eliminar(tipo.id);
    }
  }

  private eliminar(id: string): void {
    this.tiposSilleteriaService.eliminar.mutate(id, {
      onSuccess: () => this.notificationService.success('Tipo de silletería eliminado'),
      onError: (error) =>
        this.notificationService.error(
          'No se pudo eliminar el tipo de silletería',
          extraerMensajeError(error, 'Intenta de nuevo.'),
        ),
    });
  }
}
