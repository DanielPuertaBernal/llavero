import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { NotificationService } from '../../core/shared/notification.service';
import { environment } from '../../../environments/environment';
import { UsuarioFormDialogComponent } from './usuario-form-dialog.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/usuarios`;

// Ver la nota en usuarios.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP un tick después de crear el componente o de invocar
// un método que llama `mutate*`.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioDto = {
  id: 'us-1',
  nombre: 'Ana Vigilante',
  email_institucional: 'ana@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};

const valoresBase = {
  nombre: 'Ana Vigilante',
  email_institucional: 'ana@uco.edu.co',
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};

interface UsuarioFormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

/** La lista de usuarios más los 2 lookups que se disparan al inyectarse. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/catalogos/roles`).flush([{ id: 'r-1', nombre: 'Vigilante' }]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([{ id: 'ub-1', nombre: 'Portería' }]);
}

describe('UsuarioFormDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsuarioFormDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('guardar hace POST con los 5 campos de UsuarioIn, cierra el diálogo y emite guardado', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UsuarioFormDialogInternals;
    component.form.setValue(valoresBase);
    fixture.componentInstance.visible.set(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    // Ni `id` ni `oid_microsoft` viajan: el primero lo genera el backend y
    // el segundo lo fija el login federado de Office 365.
    expect(req.request.body).toEqual(valoresBase);
    req.flush(usuarioDto);
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['usuarios']` (query activa acá).
    httpMock.expectOne(`${BASE_URL}/`).flush([usuarioDto]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('envía activo en false cuando el operador desmarca la casilla', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UsuarioFormDialogInternals;
    // Por defecto la casilla viene marcada: crear un usuario ya inactivo es
    // la excepción, no lo normal.
    expect(component.form.getRawValue().activo).toBe(true);

    component.form.setValue({ ...valoresBase, activo: false });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({ ...valoresBase, activo: false });
    req.flush({ ...usuarioDto, activo: false });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...usuarioDto, activo: false }]);
  });

  it('no dispara la petición si el correo no tiene forma de email (Validators.email)', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UsuarioFormDialogInternals;
    component.form.setValue({ ...valoresBase, email_institucional: 'ana-arroba-uco' });

    expect(component.form.invalid).toBe(true);
    component.guardar();
    await cederMicrotask();

    // `httpMock.verify()` en el afterEach confirma que no se envió nada.
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });

  it('muestra el mensaje del backend tal cual cuando la creación es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    const component = fixture.componentInstance as unknown as UsuarioFormDialogInternals;
    component.form.setValue(valoresBase);
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    // La unicidad del correo la impone la base de datos: NO se pre-chequea
    // del lado cliente, se muestra el error que devuelve el backend.
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush(
        { detail: 'Ya existe un usuario con ese email institucional' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'No se pudo crear el usuario',
        'Ya existe un usuario con ese email institucional',
      ),
    );
    // El diálogo sigue abierto para que el operador corrija el correo.
    expect(fixture.componentInstance.visible()).toBe(true);
  });

  it('en modo edición precarga el formulario desde la entrada y guardar hace PATCH, no POST', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('usuario', usuarioDto);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UsuarioFormDialogInternals;
    expect(component.form.getRawValue()).toEqual(valoresBase);

    component.form.patchValue({ nombre: 'Ana Renombrada' });
    fixture.componentInstance.visible.set(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
    const req = httpMock.expectOne({ method: 'PATCH', url: `${BASE_URL}/us-1` });
    // `activo` NO viaja en el PATCH: el backend no lo acepta por ese camino
    // (el estado se cambia con desactivar/reactivar).
    expect(req.request.body).toEqual({
      nombre: 'Ana Renombrada',
      email_institucional: 'ana@uco.edu.co',
      rol_id: 'r-1',
      ubicacion_id: 'ub-1',
    });
    req.flush({ ...usuarioDto, nombre: 'Ana Renombrada' });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['usuarios']` (query activa acá).
    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...usuarioDto, nombre: 'Ana Renombrada' }]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('la casilla "Usuario activo" está en modo creación y desaparece en modo edición', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    // `UsuarioIn` sí acepta `activo`, así que crear con la casilla es válido.
    expect(fixture.nativeElement.querySelector('#usuario-activo')).not.toBeNull();

    fixture.componentRef.setInput('usuario', usuarioDto);
    fixture.detectChanges();

    // `UsuarioPatch` NO acepta `activo`: ofrecer la casilla sería prometer
    // un cambio que el PATCH nunca haría.
    expect(fixture.nativeElement.querySelector('#usuario-activo')).toBeNull();
  });

  it('el encabezado distingue creación de edición', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nuevo usuario');

    fixture.componentRef.setInput('usuario', usuarioDto);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Editar usuario');
  });

  it('al fallar la edición sugiere el correo duplicado: el backend responde 500, no un {detail} limpio', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('usuario', usuarioDto);
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    const component = fixture.componentInstance as unknown as UsuarioFormDialogInternals;
    component.form.patchValue({ email_institucional: 'bruno@uco.edu.co' });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    // La unicidad del correo NO se valida en Python: el error de Postgres se
    // propaga como 500 sin `{detail}`, así que `extraerMensajeError` cae al
    // mensaje por defecto — y ese mensaje debe ser útil.
    httpMock
      .expectOne({ method: 'PATCH', url: `${BASE_URL}/us-1` })
      .flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'No se pudo actualizar el usuario',
        expect.stringContaining('correo institucional'),
      ),
    );
    // El diálogo sigue abierto para que el operador corrija el correo.
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
