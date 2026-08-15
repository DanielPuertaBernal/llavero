import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ReservaFormDialogComponent } from './reserva-form-dialog.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/reservas`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const reservaDto = {
  id: 'rv-1',
  salon_id: 'sa-1',
  solicitante_id: 'p-1',
  fecha: '2026-08-20',
  hora_inicio: '08:00:00',
  hora_fin: '10:00:00',
  motivo: 'Asesoría de tesis',
  estado: 'aprobada',
};

const salonDto = {
  id: 'sa-1',
  nombre: 'Aula 201',
  bloque_id: 'bl-1',
  tipo_silleteria_id: 'ts-1',
  cantidad_sillas: 30,
  cantidad_mesas: 15,
};

interface FormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

/** El diálogo inyecta `ReservasService` + `ReservasLookupsService`: 3 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
}

/** Franja del 20/08/2026 de 08:00 a 10:00, en hora LOCAL — es lo que produce
 * `p-datepicker`, y lo que el componente debe serializar sin pasar por UTC. */
const fecha20Agosto = new Date(2026, 7, 20);
const hora8 = new Date(2026, 7, 20, 8, 0, 0);
const hora10 = new Date(2026, 7, 20, 10, 0, 0);

describe('ReservaFormDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservaFormDialogComponent],
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

  it('con el formulario vacío es inválido y no sale ninguna petición', async () => {
    const fixture = TestBed.createComponent(ReservaFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    expect(component.form.invalid).toBe(true);

    component.guardar();
    await cederMicrotask();
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });

  it('serializa la fecha y las horas como calendario local, sin desplazamiento por UTC', async () => {
    const fixture = TestBed.createComponent(ReservaFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: fecha20Agosto,
      hora_inicio: hora8,
      hora_fin: hora10,
      motivo: 'Asesoría de tesis',
    });
    expect(component.form.valid).toBe(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    // `toISOString()` habría mandado '2026-08-20T05:00:00Z' -> otra fecha en
    // cualquier zona al oeste de Greenwich. Estas son fechas de CALENDARIO.
    expect(req.request.body).toEqual({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: '2026-08-20',
      hora_inicio: '08:00:00',
      hora_fin: '10:00:00',
      motivo: 'Asesoría de tesis',
    });
    req.flush(reservaDto, { status: 201, statusText: 'Created' });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['reservas']` (query activa acá).
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaDto]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('OMITE motivo del payload cuando el operador no escribe ninguno', async () => {
    const fixture = TestBed.createComponent(ReservaFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: fecha20Agosto,
      hora_inicio: hora8,
      hora_fin: hora10,
      // Solo espacios: sigue siendo "sin motivo".
      motivo: '   ',
    });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    // La clave no viaja ni siquiera como `''`: la columna es NULL-able y una
    // cadena vacía no es lo mismo que "sin motivo".
    expect(Object.keys(req.request.body as object)).not.toContain('motivo');
    req.flush(reservaDto, { status: 201, statusText: 'Created' });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([reservaDto]);
    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('invalida en cliente cuando la hora de fin no es posterior a la de inicio', async () => {
    const fixture = TestBed.createComponent(ReservaFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: fecha20Agosto,
      hora_inicio: hora10,
      hora_fin: hora8,
      motivo: '',
    });

    // Validación de FORMA pura de cliente (`horaFinPosteriorAHoraInicio`):
    // no reemplaza la de SOLAPAMIENTO, que sigue siendo del backend (ver el
    // test de abajo que sí llega a mandar el POST).
    expect(component.form.valid).toBe(false);
    expect(component.form.errors?.['horaFinAntesQueInicio']).toBe(true);

    // No debería mandarse ninguna petición con una franja inválida.
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });

  it('muestra el mensaje del backend tal cual cuando la reserva es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(ReservaFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: fecha20Agosto,
      hora_inicio: hora8,
      hora_fin: hora10,
      motivo: '',
    });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` }).flush(
      {
        detail:
          'La franja 08:00:00-10:00:00 se solapa con otra reserva ya aprobada en el salón sa-1 el 2026-08-20',
      },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: expect.stringContaining('se solapa con otra reserva ya aprobada'),
        }),
      ),
    );
    // El diálogo NO se cierra ante un error: el usuario corrige y reintenta.
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
