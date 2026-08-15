import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { AuthService } from '../../core/auth/auth.service';
import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { NotificationService } from '../../core/shared/notification.service';
import { environment } from '../../../environments/environment';
import { NovedadFormDialogComponent } from './novedad-form-dialog.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/novedades`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioAutenticado: UsuarioAutenticado = {
  id: 'us-yo',
  nombre: 'Carla Operadora',
  emailInstitucional: 'carla@uco.edu.co',
  rolId: 'r-1',
  ubicacionId: 'ub-1',
};

const novedadDto = {
  id: 'nv-1',
  categoria: 'dano',
  descripcion: 'Llave doblada',
  estado: 'abierta',
  solucion: null,
  registrado_por_id: 'us-yo',
};

interface NovedadFormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

// A diferencia de `NovedadesListComponent`/`NovedadCierreDialogComponent`,
// este diálogo NO inyecta `NovedadesLookupsService`: no muestra "registrado
// por" en ningún lado, solo despacha la creación con el id de la sesión
// activa, así que la única petición al inyectarse es la lista de
// `NovedadesService`.
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
}

describe('NovedadFormDialogComponent', () => {
  let httpMock: HttpTestingController;
  let currentUser: ReturnType<typeof signal<UsuarioAutenticado | null>>;

  beforeEach(async () => {
    currentUser = signal<UsuarioAutenticado | null>(usuarioAutenticado);

    await TestBed.configureTestingModule({
      imports: [NovedadFormDialogComponent],
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

  it('guardar hace POST con categoria, descripcion y el registrado_por_id del usuario autenticado', async () => {
    const fixture = TestBed.createComponent(NovedadFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as NovedadFormDialogInternals;
    component.form.setValue({ categoria: 'dano', descripcion: 'Llave doblada' });
    fixture.componentInstance.visible.set(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      categoria: 'dano',
      descripcion: 'Llave doblada',
      registrado_por_id: 'us-yo',
    });
    req.flush(novedadDto);
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([novedadDto]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('omite descripcion del payload cuando el operador no escribe nada', async () => {
    const fixture = TestBed.createComponent(NovedadFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as NovedadFormDialogInternals;
    component.form.setValue({ categoria: 'otro', descripcion: '' });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({ categoria: 'otro', registrado_por_id: 'us-yo' });
    req.flush({ ...novedadDto, categoria: 'otro', descripcion: null });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([]);
  });

  it('no dispara la petición si no se eligió categoría', async () => {
    const fixture = TestBed.createComponent(NovedadFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as NovedadFormDialogInternals;
    expect(component.form.invalid).toBe(true);
    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });

  it('sin sesión no despacha la creación y avisa con un toast de error', async () => {
    currentUser.set(null);

    const fixture = TestBed.createComponent(NovedadFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    const component = fixture.componentInstance as unknown as NovedadFormDialogInternals;
    component.form.setValue({ categoria: 'dano', descripcion: '' });
    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
    expect(errorSpy).toHaveBeenCalledWith(
      'No se pudo crear la novedad',
      expect.any(String),
    );
  });

  it('muestra el mensaje del backend tal cual cuando la creación es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(NovedadFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    const component = fixture.componentInstance as unknown as NovedadFormDialogInternals;
    component.form.setValue({ categoria: 'dano', descripcion: '' });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush({ detail: 'El usuario no existe' }, { status: 400, statusText: 'Bad Request' });

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 'El usuario no existe'),
    );
    expect(fixture.componentInstance.visible()).toBe(true);
  });

  it('cancelar cierra el diálogo sin enviar nada', async () => {
    const fixture = TestBed.createComponent(NovedadFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    boton.click();

    expect(fixture.componentInstance.visible()).toBe(false);
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });
});
