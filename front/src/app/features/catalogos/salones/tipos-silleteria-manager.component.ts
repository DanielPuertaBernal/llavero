import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';

import { extraerMensajeError } from '../catalogos-error.util';
import type { TipoSilleteria } from '../catalogos.models';
import { TiposSilleteriaService } from '../tipos-silleteria/tipos-silleteria.service';

/**
 * CRUD del catálogo de apoyo `TipoSilleteria` — mismo patrón que
 * `BloquesManagerComponent` (ver su docstring): vive dentro de un
 * `p-dialog` de la vista de Salones, reutiliza el `p-toast`/
 * `p-confirmdialog` del padre, y no hace ningún chequeo "¿está en uso?"
 * del lado cliente (se confía en el 400 del backend).
 */
@Component({
  selector: 'app-tipos-silleteria-manager',
  standalone: true,
  imports: [TableModule, ButtonModule, InputTextModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="formNuevo" (ngSubmit)="agregar()" class="tipos-silleteria-manager__form-nuevo">
      <input
        pInputText
        type="text"
        formControlName="nombre"
        placeholder="Nombre del tipo de silletería nuevo"
        aria-label="Nombre del tipo de silletería nuevo"
      />
      <p-button
        type="submit"
        label="Agregar"
        icon="pi pi-plus"
        [disabled]="formNuevo.invalid || tiposSilleteriaService.crear.isPending()"
      />
    </form>

    <p-table
      [value]="tiposSilleteriaService.tiposSilleteria.data() ?? []"
      [loading]="tiposSilleteriaService.tiposSilleteria.isPending()"
    >
      <ng-template #header>
        <tr>
          <th>Nombre</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-tipo>
        @if (editandoId() === tipo.id) {
          <tr>
            <td>
              <form [formGroup]="formEdicion" (ngSubmit)="guardarEdicion(tipo.id)">
                <input pInputText type="text" formControlName="nombre" aria-label="Nombre del tipo de silletería" />
              </form>
            </td>
            <td>
              <p-button
                icon="pi pi-check"
                severity="success"
                [text]="true"
                (onClick)="guardarEdicion(tipo.id)"
                [disabled]="formEdicion.invalid"
                [ariaLabel]="'Guardar'"
              />
              <p-button icon="pi pi-times" severity="secondary" [text]="true" (onClick)="cancelarEdicion()" [ariaLabel]="'Cancelar'" />
            </td>
          </tr>
        } @else {
          <tr>
            <td>{{ tipo.nombre }}</td>
            <td>
              <p-button icon="pi pi-pencil" [text]="true" (onClick)="iniciarEdicion(tipo)" [ariaLabel]="'Editar'" />
              <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmarEliminar(tipo)" [ariaLabel]="'Eliminar'" />
            </td>
          </tr>
        }
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="2">No hay tipos de silletería registrados.</td>
        </tr>
      </ng-template>
    </p-table>

    @if (tiposSilleteriaService.tiposSilleteria.isError()) {
      <p role="alert">No se pudieron cargar los tipos de silletería. Intenta de nuevo.</p>
    }
  `,
  styles: `
    .tipos-silleteria-manager__form-nuevo {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
  `,
})
export class TiposSilleteriaManagerComponent {
  protected readonly tiposSilleteriaService = inject(TiposSilleteriaService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
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
          this.messageService.add({ severity: 'success', summary: 'Tipo de silletería creado' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo crear el tipo de silletería',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
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
          this.messageService.add({ severity: 'success', summary: 'Tipo de silletería actualizado' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo actualizar el tipo de silletería',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
      },
    );
  }

  protected confirmarEliminar(tipo: TipoSilleteria): void {
    this.confirmationService.confirm({
      header: 'Eliminar tipo de silletería',
      message: `¿Eliminar el tipo de silletería "${tipo.nombre}"?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.eliminar(tipo.id),
    });
  }

  private eliminar(id: string): void {
    this.tiposSilleteriaService.eliminar.mutate(id, {
      onSuccess: () =>
        this.messageService.add({ severity: 'success', summary: 'Tipo de silletería eliminado' }),
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo eliminar el tipo de silletería',
          detail: extraerMensajeError(error, 'Intenta de nuevo.'),
        }),
    });
  }
}
