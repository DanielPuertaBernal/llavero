import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { LlaveEntregaDialogComponent } from './llave-entrega-dialog.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/llaves`;

// Ver la nota en llaves.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP de forma asíncrona, un tick después de crear el
// componente o de invocar un método que llama `mutate*`.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const llaveDto = {
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

const valoresBase = {
  salon_id: 's-1',
  docente_titular_id: 'p-1',
  reclamado_por_id: 'p-2',
  origen: 'manual',
  tipo_entrega: 'credencial',
  usuario_entrega_id: 'us-1',
  ubicacion_entrega_id: 'ub-1',
  reserva_id: '',
};

interface EntregaDialogInternals {
  form: import('@angular/forms').FormGroup;
  requiereReserva(): boolean;
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

describe('LlaveEntregaDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LlaveEntregaDialogComponent],
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

  it('guardar hace POST con los 7 campos requeridos y OMITE reserva_id cuando el origen no es reserva individual', async () => {
    const fixture = TestBed.createComponent(LlaveEntregaDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as EntregaDialogInternals;
    component.form.setValue(valoresBase);
    expect(component.requiereReserva()).toBe(false);

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    // `reserva_id` no viaja ni siquiera en `null`: el backend responde 400
    // si llega junto con un origen distinto de 'reserva_individual'.
    expect(req.request.body).toEqual({
      salon_id: 's-1',
      docente_titular_id: 'p-1',
      reclamado_por_id: 'p-2',
      origen: 'manual',
      tipo_entrega: 'credencial',
      usuario_entrega_id: 'us-1',
      ubicacion_entrega_id: 'ub-1',
    });
    req.flush(llaveDto);
    await cederMicrotask();

    // Refetch tras invalidar la raíz `['llaves']` (query activa acá).
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveDto]);

    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('con origen "reserva_individual" habilita y envía reserva_id', async () => {
    const fixture = TestBed.createComponent(LlaveEntregaDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as EntregaDialogInternals;
    component.form.setValue({
      ...valoresBase,
      origen: 'reserva_individual',
      reserva_id: 'res-1',
    });
    expect(component.requiereReserva()).toBe(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      salon_id: 's-1',
      docente_titular_id: 'p-1',
      reclamado_por_id: 'p-2',
      origen: 'reserva_individual',
      tipo_entrega: 'credencial',
      usuario_entrega_id: 'us-1',
      ubicacion_entrega_id: 'ub-1',
      reserva_id: 'res-1',
    });
    req.flush({ ...llaveDto, origen: 'reserva_individual' });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([llaveDto]);
    await vi.waitFor(() => expect(emitidos.length).toBe(1));
  });

  it('muestra el mensaje del backend tal cual cuando la entrega es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(LlaveEntregaDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as EntregaDialogInternals;
    component.form.setValue(valoresBase);
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush(
        { detail: 'La ubicación no permite préstamo de llaves' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'La ubicación no permite préstamo de llaves',
        }),
      ),
    );
    // El diálogo NO se cierra ante un error: el usuario corrige y reintenta.
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
