import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

import { AuthService } from '../../core/auth/auth.service';
import { extraerMensajeError } from './usuarios-error.util';
import { UsuariosLookupsService } from './usuarios-lookups.service';
import { UsuariosService } from './usuarios.service';
import {
  OPCIONES_FILTRO_ESTADO_USUARIO,
  type FiltroEstadoUsuario,
  type Usuario,
} from './usuarios.models';
import { UsuarioFormDialogComponent } from './usuario-form-dialog.component';

/**
 * Vista principal de Usuarios: el padrón de operadores de la aplicación.
 *
 * A diferencia de las vistas de `catalogos`, esta sigue sin ser un CRUD
 * completo: el backend permite crear (`POST /api/usuarios/`), editar
 * (`PATCH /api/usuarios/{id}`) y alternar el estado
 * (`POST /{id}/desactivar` y `POST /{id}/reactivar`), pero NO existe DELETE
 * (ver back/usuarios/controller.py). Por eso la columna de acciones tiene
 * "Editar usuario", "Desactivar usuario" y "Reactivar usuario", y no hay
 * ningún botón de eliminar: un usuario se da de baja desactivándolo, y su
 * historial de préstamos sigue siendo referenciable.
 *
 * Nota de diseño — el ESTADO no se edita desde el formulario: el diálogo
 * oculta la casilla `activo` en modo edición porque `UsuarioPatch` no la
 * acepta (ver `UsuarioFormDialogComponent`). Las dos transiciones viven acá,
 * como acciones de fila con confirmación, que es donde el operador puede
 * leer sus consecuencias antes de aceptar.
 *
 * Nota de arquitectura — esta es la primera feature que depende de
 * `core/auth`, y es legítimo: la regla dura del proyecto prohíbe que una
 * feature importe código de OTRA FEATURE, nunca de `core/` (ver
 * front/README.md). `POST /{id}/desactivar` exige `usuario_actual_id` en el
 * cuerpo — quién ejecuta la acción — y ese dato solo lo tiene
 * `AuthService.currentUser()`.
 *
 * Nota de diseño — el caso "sin sesión": si `currentUser()` es `null`, la
 * desactivación NO se despacha y se muestra un toast de error. Mandar el
 * request sin `usuario_actual_id` produciría un error de validación del
 * schema mucho menos claro, y dejaría al backend sin el dato con el que
 * aplica su propia autoprotección.
 *
 * Nota de diseño — los dos filtros son AMBOS de cliente, y esa es la
 * diferencia deliberada con `llaves` y `prestamos`:
 *
 * - El de TEXTO filtra por nombre y correo institucional, que son datos que
 *   `UsuarioOut` ya trae legibles (no hay que resolver ninguna FK para
 *   buscarlos).
 * - El de ESTADO (Todos / Activos / Inactivos) también filtra en memoria.
 *   En `llaves` y `prestamos` el filtro equivalente consulta al SERVIDOR
 *   porque existe un `GET /estado/{estado}`; acá ese endpoint NO existe,
 *   así que replicar aquel patrón (una señal en el servicio, una clave de
 *   caché por estado) sería sugerir una consulta que nunca ocurre. Se deja
 *   explícito para que la asimetría entre features se lea como una
 *   decisión y no como un olvido.
 *
 * Nota de diseño — "Desactivar usuario" se deshabilita en dos casos, y
 * ninguno de los dos es "validar reglas de negocio del backend en el
 * cliente", sino no ofrecer una acción que no significa nada (mismo criterio
 * que el multiselect de `prestamo-devolucion-dialog`, que solo lista equipos
 * todavía `entregado`):
 *
 * 1. `activo === false` — el usuario ya está desactivado; la acción que le
 *    corresponde a esa fila es la simétrica, "Reactivar usuario".
 * 2. La fila es la del propio operador autenticado — el backend responde
 *    400 por autoprotección (`AutodesactivacionError`), así que ofrecer el
 *    botón sería invitar a un error garantizado.
 *
 * "Reactivar usuario" es la contraparte exacta del punto 1: solo se RENDERIZA
 * en las filas inactivas. No se muestra deshabilitado en las activas porque
 * no aporta información — la etiqueta de estado de la misma fila ya dice que
 * el usuario está activo. Ese endpoint no tiene autoprotección (nadie está
 * quitándose el acceso), así que no depende de la sesión.
 *
 * En ambos casos el backend sigue siendo la autoridad: si una petición se
 * cuela igual (por ejemplo, una sesión que cambia en otra pestaña), lo que
 * ve el usuario es el 400 del backend con su mensaje tal cual.
 */
@Component({
  selector: 'app-usuarios-list',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    UsuarioFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmdialog />

    <header class="usuarios-list__header">
      <input
        pInputText
        type="text"
        placeholder="Buscar por nombre o correo institucional..."
        aria-label="Buscar usuario por nombre o correo institucional"
        (input)="onBusquedaChange($event)"
      />
      <p-select
        [options]="opcionesEstado"
        optionLabel="label"
        optionValue="value"
        [ngModel]="filtroEstado()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onEstadoChange($event)"
        ariaLabel="Filtrar por estado"
        placeholder="Todos"
      />
      <p-button label="Nuevo usuario" icon="pi pi-plus" (onClick)="abrirCrear()" />
    </header>

    @if (usuariosService.usuarios.isError()) {
      <p role="alert">No se pudieron cargar los usuarios. Intenta de nuevo.</p>
    }

    <p-table [value]="usuariosFiltrados()" [loading]="cargando()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Nombre</th>
          <th>Correo institucional</th>
          <th>Rol</th>
          <th>Ubicación</th>
          <th>Vinculado a Microsoft</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-usuario>
        <tr>
          <td>{{ usuario.nombre }}</td>
          <td>{{ usuario.email_institucional }}</td>
          <td>{{ lookups.nombreRol(usuario.rol_id) }}</td>
          <td>{{ lookups.nombreUbicacion(usuario.ubicacion_id) }}</td>
          <td>
            <p-tag
              [severity]="usuario.oid_microsoft ? 'success' : 'warn'"
              [value]="usuario.oid_microsoft ? 'Sí' : 'No'"
            />
          </td>
          <td>
            <p-tag
              [severity]="usuario.activo ? 'success' : 'danger'"
              [value]="usuario.activo ? 'Activo' : 'Inactivo'"
            />
          </td>
          <td>
            <p-button
              icon="pi pi-pencil"
              [text]="true"
              (onClick)="abrirEditar(usuario)"
              [ariaLabel]="'Editar usuario'"
            />
            @if (!usuario.activo) {
              <p-button
                icon="pi pi-refresh"
                severity="success"
                [text]="true"
                (onClick)="confirmarReactivar(usuario)"
                [ariaLabel]="'Reactivar usuario'"
              />
            }
            <p-button
              icon="pi pi-ban"
              severity="danger"
              [text]="true"
              [disabled]="!puedeDesactivar(usuario)"
              (onClick)="confirmarDesactivar(usuario)"
              [ariaLabel]="'Desactivar usuario'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="7">No hay usuarios que coincidan con el filtro.</td>
        </tr>
      </ng-template>
    </p-table>

    <app-usuario-form-dialog [(visible)]="formDialogVisible" [usuario]="usuarioEditando()" />
  `,
  styles: `
    .usuarios-list__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }
  `,
})
export class UsuariosListComponent {
  protected readonly usuariosService = inject(UsuariosService);
  protected readonly lookups = inject(UsuariosLookupsService);
  private readonly authService = inject(AuthService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly opcionesEstado = OPCIONES_FILTRO_ESTADO_USUARIO;

  protected readonly busqueda = signal('');
  protected readonly filtroEstado = signal<FiltroEstadoUsuario>('todos');
  protected readonly formDialogVisible = signal(false);
  protected readonly usuarioEditando = signal<Usuario | null>(null);

  protected readonly cargando = computed(() => this.usuariosService.usuarios.isPending());

  protected readonly usuariosFiltrados = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const estado = this.filtroEstado();
    return (this.usuariosService.usuarios.data() ?? [])
      .filter((usuario) => coincideEstado(usuario, estado))
      .filter(
        (usuario) =>
          !termino ||
          [usuario.nombre, usuario.email_institucional].some((campo) =>
            campo.toLowerCase().includes(termino),
          ),
      );
  });

  protected onBusquedaChange(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected onEstadoChange(estado: FiltroEstadoUsuario): void {
    this.filtroEstado.set(estado);
  }

  /** Ver la nota de diseño del docblock: no ofrecer lo que no existe. */
  protected puedeDesactivar(usuario: Usuario): boolean {
    return usuario.activo && usuario.id !== this.authService.currentUser()?.id;
  }

  protected abrirCrear(): void {
    // Sin este reinicio el diálogo se abriría en modo edición con los datos
    // de la última fila editada.
    this.usuarioEditando.set(null);
    this.formDialogVisible.set(true);
  }

  protected abrirEditar(usuario: Usuario): void {
    this.usuarioEditando.set(usuario);
    this.formDialogVisible.set(true);
  }

  protected confirmarDesactivar(usuario: Usuario): void {
    this.confirmationService.confirm({
      header: 'Desactivar usuario',
      // El mensaje describe la consecuencia INMEDIATA (pierde el acceso) y
      // aclara que la decisión es reversible: `POST /{id}/reactivar` existe,
      // así que decir "no se puede deshacer" sería falso.
      message:
        `¿Desactivar a "${usuario.nombre}"? Perderá el acceso a la aplicación de inmediato. ` +
        `Podrás volver a reactivarlo más adelante desde esta misma lista.`,
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      accept: () => this.desactivar(usuario),
    });
  }

  protected confirmarReactivar(usuario: Usuario): void {
    this.confirmationService.confirm({
      header: 'Reactivar usuario',
      message:
        `¿Reactivar a "${usuario.nombre}"? Volverá a tener acceso a la aplicación ` +
        `con el rol y la ubicación que tiene asignados.`,
      acceptLabel: 'Reactivar',
      rejectLabel: 'Cancelar',
      accept: () => this.reactivar(usuario),
    });
  }

  /**
   * A diferencia de `desactivar`, no se consulta `AuthService`: el endpoint
   * no recibe `usuario_actual_id` porque no hay regla de autoprotección que
   * aplicar al devolverle el acceso a alguien.
   */
  private reactivar(usuario: Usuario): void {
    this.usuariosService.reactivar.mutate(usuario.id, {
      onSuccess: () =>
        this.messageService.add({ severity: 'success', summary: 'Usuario reactivado' }),
      onError: (error) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo reactivar el usuario',
          detail: extraerMensajeError(error, 'Intenta de nuevo.'),
        }),
    });
  }

  private desactivar(usuario: Usuario): void {
    const usuarioActual = this.authService.currentUser();
    if (!usuarioActual) {
      // Ver la nota de diseño del docblock: sin id de operador no se
      // despacha nada — el backend necesita ese dato para su autoprotección.
      this.messageService.add({
        severity: 'error',
        summary: 'No se pudo desactivar el usuario',
        detail: 'No hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.',
      });
      return;
    }

    this.usuariosService.desactivar.mutate(
      { id: usuario.id, usuario_actual_id: usuarioActual.id },
      {
        onSuccess: () =>
          this.messageService.add({ severity: 'success', summary: 'Usuario desactivado' }),
        onError: (error) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo desactivar el usuario',
            detail: extraerMensajeError(error, 'Intenta de nuevo.'),
          }),
      },
    );
  }
}

function coincideEstado(usuario: Usuario, estado: FiltroEstadoUsuario): boolean {
  if (estado === 'activos') {
    return usuario.activo;
  }
  if (estado === 'inactivos') {
    return !usuario.activo;
  }
  return true;
}
