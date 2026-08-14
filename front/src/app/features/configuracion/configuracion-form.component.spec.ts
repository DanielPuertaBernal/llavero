import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ConfiguracionFormComponent } from './configuracion-form.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/configuracion`;

// `injectQuery` dispara su lado HTTP un tick después de crear el
// componente, no en el mismo tick síncrono — mismo patrón que el resto de
// specs de este proyecto.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const configuracionDto = {
  id: 'cf-1',
  limite_antes_mora_minutos: 120,
  max_reintentos_recordatorio: 3,
  plantilla_recordatorio: null,
  ubicacion_defecto_id: 'ub-1',
  limite_no_reclamada_minutos: 30,
};

const ubicacionDto = {
  id: 'ub-1',
  nombre: 'Bodega principal',
  permite_prestamo_llaves: true,
  permite_devolucion_llaves: true,
  permite_prestamo_equipos: true,
};

interface ConfiguracionFormInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

/** La configuración más el lookup de ubicaciones que se disparan al inyectarse. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush(configuracionDto);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);
}

describe('ConfiguracionFormComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfiguracionFormComponent],
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

  it('mientras la configuración carga, muestra un estado de carga', async () => {
    const fixture = TestBed.createComponent(ConfiguracionFormComponent);
    await cederMicrotask();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Cargando');

    responderCargaInicial(httpMock);
  });

  it('precarga el formulario con los 5 campos de la configuración obtenida', async () => {
    const fixture = TestBed.createComponent(ConfiguracionFormComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as ConfiguracionFormInternals;
    await vi.waitFor(() =>
      expect(component.form.getRawValue()).toEqual({
        limite_antes_mora_minutos: 120,
        max_reintentos_recordatorio: 3,
        plantilla_recordatorio: '',
        ubicacion_defecto_id: 'ub-1',
        limite_no_reclamada_minutos: 30,
      }),
    );
  });

  it('guardar hace PUT con los 5 campos y muestra un toast de éxito', async () => {
    const fixture = TestBed.createComponent(ConfiguracionFormComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();
    await cederMicrotask();
    fixture.detectChanges();

    const messageService = fixture.debugElement.injector.get(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as ConfiguracionFormInternals;
    component.form.patchValue({
      limite_antes_mora_minutos: 90,
      max_reintentos_recordatorio: 5,
      plantilla_recordatorio: 'Recuerda entregar la llave a tiempo.',
      ubicacion_defecto_id: 'ub-1',
      limite_no_reclamada_minutos: 45,
    });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'PUT', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      ubicacion_defecto_id: 'ub-1',
      limite_antes_mora_minutos: 90,
      max_reintentos_recordatorio: 5,
      plantilla_recordatorio: 'Recuerda entregar la llave a tiempo.',
      limite_no_reclamada_minutos: 45,
    });
    req.flush({ ...configuracionDto, limite_antes_mora_minutos: 90 });
    await cederMicrotask();

    // La mutación invalida la raíz: el GET vuelve a dispararse.
    httpMock.expectOne(`${BASE_URL}/`).flush({ ...configuracionDto, limite_antes_mora_minutos: 90 });

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  it('al fallar la actualización muestra un toast de error con el detalle del backend', async () => {
    const fixture = TestBed.createComponent(ConfiguracionFormComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = fixture.debugElement.injector.get(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as ConfiguracionFormInternals;
    await vi.waitFor(() => expect(component.form.valid).toBe(true));
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'PUT', url: `${BASE_URL}/` });
    req.flush({ detail: 'La ubicación por defecto no existe.' }, { status: 400, statusText: 'Bad Request' });
    await cederMicrotask();

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: 'La ubicación por defecto no existe.',
      }),
    );
  });

  it('nunca hace POST a /api/configuracion/: el GET ya garantiza que la fila existe', async () => {
    const fixture = TestBed.createComponent(ConfiguracionFormComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as ConfiguracionFormInternals;
    await vi.waitFor(() => expect(component.form.valid).toBe(true));
    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
    const req = httpMock.expectOne({ method: 'PUT', url: `${BASE_URL}/` });
    req.flush(configuracionDto);
    await cederMicrotask();

    // La mutación invalida la raíz: el GET vuelve a dispararse.
    httpMock.expectOne(`${BASE_URL}/`).flush(configuracionDto);
  });
});
