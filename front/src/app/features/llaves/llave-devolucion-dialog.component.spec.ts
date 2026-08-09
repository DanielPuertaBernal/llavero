import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { LlaveDevolucionDialogComponent } from './llave-devolucion-dialog.component';
import type { Llave } from './llaves.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/llaves`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const llaveEnPrestamo: Llave = {
  id: 'l-1',
  salon_id: 's-1',
  docente_titular_id: 'p-1',
  reclamado_por_id: 'p-2',
  origen: 'manual',
  tipo_entrega: 'credencial',
  tipo_devolucion: null,
  usuario_entrega_id: 'us-1',
  usuario_recibe_id: null,
  ubicacion_entrega_id: 'ub-1',
  ubicacion_devolucion_id: null,
  novedad_id: null,
  fecha_hora_entrega: '2026-08-09T14:30:00Z',
  fecha_hora_devolucion: null,
  estado: 'en_prestamo',
};

interface DevolucionDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

/** El diálogo inyecta `LlavesService` + `LlavesLookupsService`: 6 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([]);
  httpMock.expectOne(`${API}/usuarios/`).flush([]);
  httpMock.expectOne(`${API}/novedades/`).flush([]);
}

describe('LlaveDevolucionDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LlaveDevolucionDialogComponent],
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

  it('guardar hace POST a /{id}/devolver enviando novedad_id en null cuando no se elige novedad', async () => {
    const fixture = TestBed.createComponent(LlaveDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('llave', llaveEnPrestamo);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'manual',
      novedad_id: '',
    });

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/l-1/devolver` });
    // `novedad_id` sí viaja, explícitamente en `null` (a diferencia de
    // `reserva_id` en la entrega, que se omite): el schema
    // `DevolverLlaveIn` lo declara nullable.
    expect(req.request.body).toEqual({
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'manual',
      novedad_id: null,
    });
    req.flush({ ...llaveEnPrestamo, estado: 'entregado' });
    await cederMicrotask();

    // Refetch tras invalidar la raíz `['llaves']` (query activa acá).
    httpMock.expectOne(`${BASE_URL}/`).flush([]);

    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('envía el novedad_id seleccionado cuando la devolución tiene una novedad asociada', async () => {
    const fixture = TestBed.createComponent(LlaveDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('llave', llaveEnPrestamo);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'credencial',
      novedad_id: 'n-1',
    });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/l-1/devolver` });
    expect(req.request.body).toEqual({
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'credencial',
      novedad_id: 'n-1',
    });
    req.flush({ ...llaveEnPrestamo, estado: 'entregado' });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([]);
  });

  it('sin llave seleccionada no hace ninguna petición', async () => {
    const fixture = TestBed.createComponent(LlaveDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'manual',
      novedad_id: '',
    });
    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/l-1/devolver` });
  });

  it('muestra el mensaje del backend tal cual cuando la devolución es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(LlaveDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('llave', llaveEnPrestamo);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'manual',
      novedad_id: '',
    });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/l-1/devolver` })
      .flush(
        { detail: 'La ubicación no permite devolución de llaves' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'La ubicación no permite devolución de llaves',
        }),
      ),
    );
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
