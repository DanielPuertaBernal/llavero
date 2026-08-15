import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { AuthService } from '../../core/auth/auth.service';
import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { ConfirmService } from '../../core/shared/confirm.service';
import { NotificationService } from '../../core/shared/notification.service';
import { environment } from '../../../environments/environment';
import { UsuariosListComponent } from './usuarios-list.component';
import type { FiltroEstadoUsuario, Usuario } from './usuarios.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/usuarios`;

// Ver la nota en usuarios.service.spec.ts: `injectQuery` dispara su lado
// HTTP un tick después de crear el componente.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const rolDto = { id: 'r-1', nombre: 'Vigilante' };
const ubicacionDto = { id: 'ub-1', nombre: 'Portería' };

/** El usuario que opera la aplicación en estos tests. */
const usuarioAutenticado: UsuarioAutenticado = {
  id: 'us-yo',
  nombre: 'Carla Operadora',
  emailInstitucional: 'carla@uco.edu.co',
  rolId: 'r-1',
  ubicacionId: 'ub-1',
};

const usuarioActivo: Usuario = {
  id: 'us-1',
  nombre: 'Ana Vigilante',
  email_institucional: 'ana@uco.edu.co',
  oid_microsoft: 'oid-abc',
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};

const usuarioInactivo: Usuario = {
  ...usuarioActivo,
  id: 'us-2',
  nombre: 'Bruno Retirado',
  email_institucional: 'bruno@uco.edu.co',
  oid_microsoft: null,
  activo: false,
};

/** La fila del propio operador: existe en la lista como cualquier otra. */
const usuarioPropio: Usuario = {
  ...usuarioActivo,
  id: 'us-yo',
  nombre: 'Carla Operadora',
  email_institucional: 'carla@uco.edu.co',
};

interface UsuariosListInternals {
  busqueda: import('@angular/core').WritableSignal<string>;
  filtroEstado: import('@angular/core').WritableSignal<FiltroEstadoUsuario>;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  usuarioEditando: import('@angular/core').WritableSignal<Usuario | null>;
  onEstadoChange(estado: FiltroEstadoUsuario): void;
  abrirCrear(): void;
}

/** La lista de usuarios más los 2 lookups que se disparan al inyectarse. */
function responderCargaInicial(httpMock: HttpTestingController, usuarios: Usuario[]): void {
  httpMock.expectOne(`${BASE_URL}/`).flush(usuarios);
  httpMock.expectOne(`${API}/catalogos/roles`).flush([rolDto]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);
}

function botonesPorEtiqueta(
  fixture: { nativeElement: HTMLElement },
  etiqueta: string,
): NodeListOf<HTMLButtonElement> {
  return fixture.nativeElement.querySelectorAll(
    `button[aria-label="${etiqueta}"]`,
  ) as NodeListOf<HTMLButtonElement>;
}

function botonesDesactivar(fixture: { nativeElement: HTMLElement }): NodeListOf<HTMLButtonElement> {
  return botonesPorEtiqueta(fixture, 'Desactivar usuario');
}

function botonesEditar(fixture: { nativeElement: HTMLElement }): NodeListOf<HTMLButtonElement> {
  return botonesPorEtiqueta(fixture, 'Editar usuario');
}

function botonesReactivar(fixture: { nativeElement: HTMLElement }): NodeListOf<HTMLButtonElement> {
  return botonesPorEtiqueta(fixture, 'Reactivar usuario');
}

describe('UsuariosListComponent', () => {
  let httpMock: HttpTestingController;
  // `AuthService.currentUser` es un `computed`; un `signal` es
  // call-compatible, así que sirve de doble y además permite simular la
  // ausencia de sesión.
  let currentUser: ReturnType<typeof signal<UsuarioAutenticado | null>>;

  beforeEach(async () => {
    currentUser = signal<UsuarioAutenticado | null>(usuarioAutenticado);

    await TestBed.configureTestingModule({
      imports: [UsuariosListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: AuthService, useValue: { currentUser } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('resuelve rol y ubicación a nombre legible y etiqueta vinculación y estado', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo, usuarioInactivo]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    });

    // Aserción por CELDA, no sobre el texto suelto de la página: "No" es
    // subcadena de "Nombre" y "Vigilante" lo es de "Ana Vigilante", así que
    // un `toContain` sobre `textContent` no probaría nada.
    const celdas = (fila: number) =>
      Array.from(
        fixture.nativeElement.querySelectorAll('tbody tr')[fila].querySelectorAll('td'),
      ).map((celda) => (celda as HTMLElement).textContent?.trim());

    expect(celdas(0).slice(0, 6)).toEqual([
      'Ana Vigilante',
      'ana@uco.edu.co',
      'Vigilante',
      'Portería',
      // `oid_microsoft` no nulo -> "Sí".
      'Sí',
      'Activo',
    ]);
    expect(celdas(1).slice(0, 6)).toEqual([
      'Bruno Retirado',
      'bruno@uco.edu.co',
      'Vigilante',
      'Portería',
      // `oid_microsoft` nulo -> "No": nunca entró por Office 365.
      'No',
      'Inactivo',
    ]);
  });

  it('cae al id crudo mientras los lookups no hayan cargado', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([usuarioActivo]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('r-1');
    });

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolDto]);
    httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolDto]);
    httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar los usuarios');
    });
  });

  it('el filtro de estado es de CLIENTE: no dispara ninguna petición nueva', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo, usuarioInactivo]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Ana Vigilante');
    });

    const component = fixture.componentInstance as unknown as UsuariosListInternals;
    component.onEstadoChange('inactivos');
    await cederMicrotask();
    fixture.detectChanges();

    // A diferencia de llaves/prestamos, no existe `GET /usuarios/estado/...`:
    // el filtrado ocurre sobre la lista ya descargada.
    httpMock.expectNone(`${BASE_URL}/estado/inactivos`);
    httpMock.expectNone(`${BASE_URL}/`);
    expect(fixture.nativeElement.textContent).toContain('Bruno Retirado');
    expect(fixture.nativeElement.textContent).not.toContain('Ana Vigilante');

    component.onEstadoChange('activos');
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectNone(`${BASE_URL}/`);
    expect(fixture.nativeElement.textContent).toContain('Ana Vigilante');
    expect(fixture.nativeElement.textContent).not.toContain('Bruno Retirado');
  });

  it('la búsqueda de texto filtra por nombre y por correo institucional', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo, usuarioInactivo]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Ana Vigilante');
    });

    const component = fixture.componentInstance as unknown as UsuariosListInternals;
    component.busqueda.set('bruno@uco');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Bruno Retirado');
    expect(fixture.nativeElement.textContent).not.toContain('Ana Vigilante');
  });

  it('deshabilita "Desactivar usuario" en la fila del propio operador y en los ya inactivos', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo, usuarioInactivo, usuarioPropio]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesDesactivar(fixture).length).toBe(3);
    });

    const botones = botonesDesactivar(fixture);
    // Activo y ajeno: la única acción realmente disponible.
    expect(botones[0].disabled).toBe(false);
    // Ya inactivo: desactivarlo otra vez no significa nada — la acción que
    // le corresponde a esa fila es "Reactivar usuario".
    expect(botones[1].disabled).toBe(true);
    // La propia fila: el backend lo rechaza con su 400 de autoprotección.
    expect(botones[2].disabled).toBe(true);
  });

  it('desactivar pide confirmación diciendo que es reversible y envía el id del usuario autenticado', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo]);

    const confirmService = TestBed.inject(ConfirmService);
    const confirmarSpy = vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesDesactivar(fixture).length).toBe(1);
    });

    botonesDesactivar(fixture)[0].click();
    await cederMicrotask();

    expect(confirmarSpy).toHaveBeenCalledOnce();
    const opciones = confirmarSpy.mock.calls[0][0];
    expect(opciones.mensaje).toContain('Ana Vigilante');
    // El backend YA expone `POST /{id}/reactivar`, así que el mensaje no
    // puede seguir diciendo que la acción es irreversible: eso sería mentirle
    // al operador. Lo que debe comunicar es la pérdida inmediata de acceso y
    // que la decisión se puede revertir después.
    expect(opciones.mensaje).not.toContain('no se puede deshacer');
    expect(opciones.mensaje).toContain('reactivar');

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/us-1/desactivar` });
    // El quid de esta feature: `usuario_actual_id` sale de `core/auth`.
    expect(req.request.body).toEqual({ usuario_actual_id: 'us-yo' });
    req.flush({ ...usuarioActivo, activo: false });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['usuarios']`.
    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...usuarioActivo, activo: false }]);
  });

  it('sin sesión no despacha la desactivación y avisa con un toast de error', async () => {
    currentUser.set(null);

    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo]);

    const confirmService = TestBed.inject(ConfirmService);
    const notificationService = TestBed.inject(NotificationService);
    vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);
    const errorSpy = vi.spyOn(notificationService, 'error');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesDesactivar(fixture).length).toBe(1);
    });

    botonesDesactivar(fixture)[0].click();
    await cederMicrotask();

    // Nunca se manda un request con `usuario_actual_id` faltante: sin id de
    // operador el backend no podría ni aplicar su autoprotección.
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/us-1/desactivar` });
    expect(errorSpy).toHaveBeenCalledWith(
      'No se pudo desactivar el usuario',
      'No hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.',
    );
  });

  it('muestra el mensaje del backend tal cual cuando la desactivación es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo]);

    const confirmService = TestBed.inject(ConfirmService);
    const notificationService = TestBed.inject(NotificationService);
    vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);
    const errorSpy = vi.spyOn(notificationService, 'error');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesDesactivar(fixture).length).toBe(1);
    });

    botonesDesactivar(fixture)[0].click();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/us-1/desactivar` })
      .flush(
        { detail: 'Un usuario no puede desactivarse a sí mismo' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'No se pudo desactivar el usuario',
        'Un usuario no puede desactivarse a sí mismo',
      ),
    );
  });

  it('"Nuevo usuario" abre el diálogo de creación', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, []);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UsuariosListInternals;
    component.abrirCrear();

    expect(component.formDialogVisible()).toBe(true);
  });

  it('"Editar usuario" abre el diálogo con la fila precargada, y "Nuevo usuario" la limpia', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo, usuarioInactivo]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      // El botón de editar existe en TODAS las filas: `UsuarioPatch` no
      // depende del estado del usuario.
      expect(botonesEditar(fixture).length).toBe(2);
    });

    const component = fixture.componentInstance as unknown as UsuariosListInternals;
    botonesEditar(fixture)[1].click();

    expect(component.usuarioEditando()).toEqual(usuarioInactivo);
    expect(component.formDialogVisible()).toBe(true);

    // Sin este reinicio, "Nuevo usuario" abriría el diálogo en modo edición
    // con los datos de la última fila tocada.
    component.abrirCrear();
    expect(component.usuarioEditando()).toBeNull();
  });

  it('"Reactivar usuario" solo aparece en las filas inactivas', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioActivo, usuarioInactivo, usuarioPropio]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(3);
    });

    // Solo `Bruno Retirado` está inactivo: reactivar a alguien que ya está
    // activo no es una acción que tenga sentido ofrecer.
    expect(botonesReactivar(fixture).length).toBe(1);
    const fila = botonesReactivar(fixture)[0].closest('tr') as HTMLElement;
    expect(fila.textContent).toContain('Bruno Retirado');
  });

  it('reactivar pide confirmación y hace POST a /api/usuarios/{id}/reactivar sin cuerpo', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioInactivo]);

    const confirmService = TestBed.inject(ConfirmService);
    const notificationService = TestBed.inject(NotificationService);
    const confirmarSpy = vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);
    const successSpy = vi.spyOn(notificationService, 'success');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesReactivar(fixture).length).toBe(1);
    });

    botonesReactivar(fixture)[0].click();
    await cederMicrotask();

    expect(confirmarSpy).toHaveBeenCalledOnce();
    const opciones = confirmarSpy.mock.calls[0][0];
    expect(opciones.mensaje).toContain('Bruno Retirado');
    expect(opciones.titulo).toBe('Reactivar usuario');

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/us-2/reactivar` });
    // A diferencia de desactivar, el endpoint NO recibe `usuario_actual_id`:
    // no hay regla de autoprotección que aplicar al reactivar.
    expect(req.request.body).toEqual({});
    req.flush({ ...usuarioInactivo, activo: true });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['usuarios']`.
    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...usuarioInactivo, activo: true }]);

    await vi.waitFor(() => expect(successSpy).toHaveBeenCalledWith('Usuario reactivado'));
  });

  it('muestra el mensaje del backend tal cual cuando la reactivación falla con 404', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [usuarioInactivo]);

    const confirmService = TestBed.inject(ConfirmService);
    const notificationService = TestBed.inject(NotificationService);
    vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);
    const errorSpy = vi.spyOn(notificationService, 'error');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesReactivar(fixture).length).toBe(1);
    });

    botonesReactivar(fixture)[0].click();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/us-2/reactivar` })
      .flush({ detail: 'Usuario no encontrado' }, { status: 404, statusText: 'Not Found' });

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('No se pudo reactivar el usuario', 'Usuario no encontrado'),
    );
  });

  it('muestra un mensaje vacío en español cuando ningún usuario coincide', async () => {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, []);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No hay usuarios');
    });
  });
});
