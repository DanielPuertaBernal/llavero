import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { PrestamoFormDialogComponent } from './prestamo-form-dialog.component';
import { PrestamosLookupsService } from './prestamos-lookups.service';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/prestamos`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const prestamoDto = {
  id: 'pr-1',
  solicitante_id: 'p-1',
  usuario_prestamista_id: 'us-1',
  ubicacion_id: 'ub-1',
  estado: 'activo',
  fecha_creacion: '2026-08-09T14:30:00Z',
};

const ubicacionSinPrestamoDto = {
  id: 'ub-2',
  nombre: 'Archivo',
  permite_prestamo_llaves: false,
  permite_devolucion_llaves: false,
  permite_prestamo_equipos: false,
};
const ubicacionConPrestamoDto = {
  id: 'ub-1',
  nombre: 'Almacén',
  permite_prestamo_llaves: false,
  permite_devolucion_llaves: false,
  permite_prestamo_equipos: true,
};

interface FormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

/** El diálogo inyecta `PrestamosService` + `PrestamosLookupsService`: 6 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([]);
  httpMock.expectOne(`${API}/usuarios/`).flush([]);
  httpMock
    .expectOne(`${API}/catalogos/ubicaciones`)
    .flush([ubicacionSinPrestamoDto, ubicacionConPrestamoDto]);
  httpMock.expectOne(`${API}/equipos/`).flush([]);
  httpMock.expectOne(`${API}/novedades/`).flush([]);
}

describe('PrestamoFormDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrestamoFormDialogComponent],
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

  it('sin equipos seleccionados el formulario es inválido (el backend exige al menos uno)', async () => {
    const fixture = TestBed.createComponent(PrestamoFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      solicitante_id: 'p-1',
      usuario_prestamista_id: 'us-1',
      ubicacion_id: 'ub-1',
      equipo_ids: [],
    });

    expect(component.form.invalid).toBe(true);

    // Y si se invoca igual, no sale ninguna petición.
    component.guardar();
    await cederMicrotask();
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });

  it('guardar hace POST a /api/prestamos/ con los 3 ids y la lista de equipos', async () => {
    const fixture = TestBed.createComponent(PrestamoFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      solicitante_id: 'p-1',
      usuario_prestamista_id: 'us-1',
      ubicacion_id: 'ub-1',
      equipo_ids: ['eq-1', 'eq-2'],
    });
    expect(component.form.valid).toBe(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      solicitante_id: 'p-1',
      usuario_prestamista_id: 'us-1',
      ubicacion_id: 'ub-1',
      equipo_ids: ['eq-1', 'eq-2'],
    });
    req.flush(prestamoDto, { status: 201, statusText: 'Created' });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['prestamos']` (query activa acá).
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoDto]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('ofrece primero las ubicaciones que permiten préstamo de equipos, sin excluir las demás', async () => {
    const fixture = TestBed.createComponent(PrestamoFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const lookups = fixture.debugElement.injector.get(PrestamosLookupsService);

    await vi.waitFor(() => expect(lookups.ubicacionesPrestamo().length).toBe(2));
    expect(lookups.ubicacionesPrestamo().map((ubicacion) => ubicacion.id)).toEqual([
      'ub-1',
      'ub-2',
    ]);
  });

  it('muestra el mensaje del backend tal cual cuando el préstamo es rechazado con 400', async () => {
    const fixture = TestBed.createComponent(PrestamoFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      solicitante_id: 'p-1',
      usuario_prestamista_id: 'us-1',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1'],
    });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush(
        { detail: 'La ubicación no permite préstamo de equipos' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'La ubicación no permite préstamo de equipos',
        }),
      ),
    );
    // El diálogo NO se cierra ante un error: el usuario corrige y reintenta.
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
