import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

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
        MessageService,
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

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

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
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Ya existe un usuario con ese email institucional',
        }),
      ),
    );
    // El diálogo sigue abierto para que el operador corrija el correo.
    expect(fixture.componentInstance.visible()).toBe(true);
  });

  it('es de solo creación: no expone una entrada para precargar un usuario existente', async () => {
    const fixture = TestBed.createComponent(UsuarioFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    // El backend no expone PATCH sobre usuarios, así que un modo edición
    // sería una promesa que la API no puede cumplir.
    expect(() => fixture.componentRef.setInput('usuario', usuarioDto)).toThrow();
  });
});
