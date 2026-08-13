import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ReservaSemestralFormDialogComponent } from './reserva-semestral-form-dialog.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/reservas-semestrales`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const salonDto = {
  id: 'sa-1',
  nombre: 'Aula 201',
  bloque_id: 'bl-1',
  tipo_silleteria_id: 'ts-1',
  cantidad_sillas: 30,
  cantidad_mesas: 15,
};

const semestreDto = {
  id: 'sem-1',
  codigo: '2026-2',
  fecha_inicio: '2026-08-03',
  fecha_fin: '2026-12-05',
};

const franjaCreadaDto = {
  id: 'rs-1',
  salon_id: 'sa-1',
  solicitante_id: 'p-1',
  semestre_id: 'sem-1',
  dia: 'lunes',
  hora_inicio: '08:00:00',
  hora_fin: '10:00:00',
  grupo_id: 'g-1',
  creado_manualmente: true,
};

interface FranjaFormValue {
  dia: string;
  hora_inicio: Date | null;
  hora_fin: Date | null;
}

interface FormDialogInternals {
  form: import('@angular/forms').FormGroup;
  franjasArray: import('@angular/forms').FormArray;
  agregarFranja(): void;
  quitarFranja(indice: number): void;
  guardar(): void;
}

/** El diálogo inyecta `ReservasSemestralesService` + `ReservasSemestralesLookupsService`: 4 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
  httpMock.expectOne(`${API}/programacion/semestres`).flush([semestreDto]);
}

const hora8 = new Date(2026, 7, 20, 8, 0, 0);
const hora10 = new Date(2026, 7, 20, 10, 0, 0);

describe('ReservaSemestralFormDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservaSemestralFormDialogComponent],
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

  it('arranca con una sola franja en la lista y el formulario inválido', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    expect(component.franjasArray.length).toBe(1);
    expect(component.form.invalid).toBe(true);

    component.guardar();
    await cederMicrotask();
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });

  it('agregarFranja añade otra fila de franja y quitarFranja la elimina', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.agregarFranja();
    expect(component.franjasArray.length).toBe(2);

    component.quitarFranja(0);
    expect(component.franjasArray.length).toBe(1);
  });

  it('no permite quitar la última franja: siempre debe quedar al menos una', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    expect(component.franjasArray.length).toBe(1);

    component.quitarFranja(0);
    expect(component.franjasArray.length).toBe(1);
  });

  it('envía un solo POST con TODAS las franjas agregadas', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.patchValue({ salon_id: 'sa-1', solicitante_id: 'p-1', semestre_id: 'sem-1' });
    component.franjasArray.at(0).setValue({
      dia: 'lunes',
      hora_inicio: hora8,
      hora_fin: hora10,
    } satisfies FranjaFormValue);
    component.agregarFranja();
    component.franjasArray.at(1).setValue({
      dia: 'miercoles',
      hora_inicio: hora8,
      hora_fin: hora10,
    } satisfies FranjaFormValue);

    expect(component.form.valid).toBe(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    // Serializado en hora LOCAL, sin pasar por `toISOString()` (mismo
    // criterio que `ReservaFormDialogComponent` de la feature hermana).
    expect(req.request.body).toEqual({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      semestre_id: 'sem-1',
      franjas: [
        { dia: 'lunes', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
        { dia: 'miercoles', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
      ],
    });
    req.flush([franjaCreadaDto, { ...franjaCreadaDto, id: 'rs-2', dia: 'miercoles' }], {
      status: 201,
      statusText: 'Created',
    });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['reservas-semestrales']`.
    httpMock.expectOne(`${BASE_URL}/`).flush([franjaCreadaDto]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
      // Vuelve a quedar una sola franja en blanco, lista para el próximo registro.
      expect(component.franjasArray.length).toBe(1);
    });
  });

  it('deja la validación de solapamiento al backend y muestra su 400', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.patchValue({ salon_id: 'sa-1', solicitante_id: 'p-1', semestre_id: 'sem-1' });
    component.franjasArray.at(0).setValue({
      dia: 'lunes',
      hora_inicio: hora8,
      hora_fin: hora10,
    } satisfies FranjaFormValue);

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` }).flush(
      { detail: 'La franja lunes 08:00:00-10:00:00 se solapa con una programación existente' },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: expect.stringContaining('se solapa con una programación existente'),
        }),
      ),
    );
    // El diálogo NO se cierra ante un error: el usuario corrige y reintenta.
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
