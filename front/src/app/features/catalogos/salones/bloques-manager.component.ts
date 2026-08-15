import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';

import { extraerMensajeError } from '../catalogos-error.util';
import type { Bloque } from '../catalogos.models';
import { BloquesService } from '../bloques/bloques.service';

/**
 * CRUD del catálogo de apoyo `Bloque`, pensado para vivir dentro de un
 * `p-dialog` lanzado desde la vista de Salones (ver
 * salones-list.component.ts) — NO tiene ruta propia, igual que en el
 * frontend legacy (ver AulaSync/analisis/frontend/catalogos.md §1).
 *
 * No re-provee `ConfirmationService`/`MessageService`: usa el `p-toast`/
 * `p-confirmdialog` únicos del componente padre (inyección jerárquica), en
 * vez de tener su propio popup duplicado.
 *
 * Eliminar NO hace ningún chequeo "¿está en uso?" del lado cliente (a
 * diferencia del legacy, ver catalogos.md §6/§8) — se confía en el 400 que
 * el backend ya devuelve si el bloque sigue referenciado por un salón.
 */
@Component({
  selector: 'app-bloques-manager',
  standalone: true,
  imports: [TableModule, ButtonModule, InputTextModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="formNuevo" (ngSubmit)="agregar()" class="bloques-manager__form-nuevo">
      <input
        pInputText
        type="text"
        formControlName="nombre"
        placeholder="Nombre del bloque nuevo"
        aria-label="Nombre del bloque nuevo"
      />
      <p-button
        type="submit"
        label="Agregar"
        icon="pi pi-plus"
        [disabled]="formNuevo.invalid || bloquesService.crear.isPending()"
      />
    </form>

    <p-table [value]="bloquesService.bloques.data() ?? []" [loading]="bloquesService.bloques.isPending()">
      <ng-template #header>
        <tr>
          <th>Nombre</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-bloque>
        @if (editandoId() === bloque.id) {
          <tr>
            <td>
              <form [formGroup]="formEdicion" (ngSubmit)="guardarEdicion(bloque.id)">
                <input pInputText type="text" formControlName="nombre" aria-label="Nombre del bloque" />
              </form>
            </td>
            <td>
              <p-button
                icon="pi pi-check"
                severity="success"
                [text]="true"
                (onClick)="guardarEdicion(bloque.id)"
                [disabled]="formEdicion.invalid"
                [ariaLabel]="'Guardar'"
              />
              <p-button icon="pi pi-times" severity="secondary" [text]="true" (onClick)="cancelarEdicion()" [ariaLabel]="'Cancelar'" />
            </td>
          </tr>
        } @else {
          <tr>
            <td>{{ bloque.nombre }}</td>
            <td>
              <p-button icon="pi pi-pencil" [text]="true" (onClick)="iniciarEdicion(bloque)" [ariaLabel]="'Editar'" />
              <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmarEliminar(bloque)" [ariaLabel]="'Eliminar'" />
            </td>
          </tr>
        }
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="2">No hay bloques registrados.</td>
        </tr>
      </ng-template>
    </p-table>

    @if (bloquesService.bloques.isError()) {
      <p role="alert">No se pudieron cargar los bloques. Intenta de nuevo.</p>
    }
  `,
  styles: `
    .bloques-manager__form-nuevo {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
  `,
})
export class BloquesManagerComponent {
  protected readonly bloquesService = inject(BloquesService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
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
          this.messageService.add({ severity: 'success', summary: 'Bloque creado' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo crear el bloque',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
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
          this.messageService.add({ severity: 'success', summary: 'Bloque actualizado' });
        },
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo actualizar el bloque',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
      },
    );
  }

  protected confirmarEliminar(bloque: Bloque): void {
    this.confirmationService.confirm({
      header: 'Eliminar bloque',
      message: `¿Eliminar el bloque "${bloque.nombre}"?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.eliminar(bloque.id),
    });
  }

  private eliminar(id: string): void {
    this.bloquesService.eliminar.mutate(id, {
      onSuccess: () => this.messageService.add({ severity: 'success', summary: 'Bloque eliminado' }),
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo eliminar el bloque',
          detail: extraerMensajeError(error, 'Intenta de nuevo.'),
        }),
    });
  }
}
