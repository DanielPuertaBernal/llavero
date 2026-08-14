import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { disponibilidadQueryKeys } from './disponibilidad-query-keys';
import { DisponibilidadService } from './disponibilidad.service';
import type { DisponibilidadSalon } from './disponibilidad.models';

const BASE_URL = `${environment.apiBaseUrl}/disponibilidad`;

// Ver la misma nota en reservas.service.spec.ts: `injectQuery` dispara su
// lado HTTP un tick después de fijar la señal que consume, no en el mismo
// tick síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const respuestaSinConflictos: DisponibilidadSalon = {
  salon_id: 'sa-1',
  dia: 'lunes',
  fecha: '2026-03-09',
  ocupaciones: [
    {
      origen: 'programacion',
      id: 'oc-1',
      recurrente: true,
      dia_semana: 'lunes',
      fecha: null,
      hora_inicio: '08:00:00',
      hora_fin: '10:00:00',
      titulo: 'Cálculo I',
      responsable_id: 'r-1',
      estado: null,
    },
  ],
  conflictos: [],
};

const respuestaConConflictos: DisponibilidadSalon = {
  salon_id: 'sa-1',
  dia: 'lunes',
  fecha: '2026-03-09',
  ocupaciones: [
    {
      origen: 'programacion',
      id: 'oc-1',
      recurrente: true,
      dia_semana: 'lunes',
      fecha: null,
      hora_inicio: '08:00:00',
      hora_fin: '10:00:00',
      titulo: 'Cálculo I',
      responsable_id: 'r-1',
      estado: null,
    },
    {
      origen: 'reserva_individual',
      id: 'oc-2',
      recurrente: false,
      dia_semana: null,
      fecha: '2026-03-09',
      hora_inicio: '09:00:00',
      hora_fin: '11:00:00',
      titulo: 'Asesoría de tesis',
      responsable_id: 'r-2',
      estado: 'aprobada',
    },
  ],
  conflictos: [{ ocupacion_a_id: 'oc-1', ocupacion_b_id: 'oc-2' }],
};

describe('DisponibilidadService', () => {
  let service: DisponibilidadService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(DisponibilidadService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sin salón seleccionado no dispara ninguna consulta', async () => {
    await cederMicrotask();
    httpMock.expectNone(`${BASE_URL}/salon/sa-1?fecha=2026-03-09`);
    expect(service.disponibilidad.data()).toBeUndefined();
  });

  it('con salón y fecha consulta el endpoint con ambos query params y expone ocupaciones y conflictos', async () => {
    service.salonId.set('sa-1');
    service.fecha.set('2026-03-09');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-03-09`).flush(respuestaConConflictos);

    await vi.waitFor(() => {
      expect(service.disponibilidad.data()?.ocupaciones.length).toBe(2);
      expect(service.disponibilidad.data()?.conflictos).toEqual([
        { ocupacion_a_id: 'oc-1', ocupacion_b_id: 'oc-2' },
      ]);
    });
  });

  it('estado vacío: el backend puede devolver ocupaciones y conflictos vacíos', async () => {
    service.salonId.set('sa-1');
    service.fecha.set('2026-03-10');
    await cederMicrotask();

    httpMock
      .expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-03-10`)
      .flush({ ...respuestaSinConflictos, fecha: '2026-03-10', ocupaciones: [] });

    await vi.waitFor(() => {
      expect(service.disponibilidad.data()?.ocupaciones).toEqual([]);
      expect(service.disponibilidad.isSuccess()).toBe(true);
    });
  });

  it('sin fecha (modo recurrente) consulta el endpoint sin el query param fecha', async () => {
    service.salonId.set('sa-1');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/salon/sa-1`).flush(respuestaSinConflictos);

    await vi.waitFor(() => expect(service.disponibilidad.data()?.ocupaciones.length).toBe(1));
  });

  it('propaga el 400 del backend (ej. salón inexistente o dia+fecha inconsistentes)', async () => {
    service.salonId.set('sa-inexistente');
    service.fecha.set('2026-03-09');
    await cederMicrotask();

    httpMock
      .expectOne(`${BASE_URL}/salon/sa-inexistente?fecha=2026-03-09`)
      .flush({ detail: 'El salón no existe' }, { status: 400, statusText: 'Bad Request' });

    await vi.waitFor(() => expect(service.disponibilidad.isError()).toBe(true));
  });

  it('reacciona a un cambio de salón: consulta el endpoint nuevo bajo su propia clave de caché', async () => {
    service.salonId.set('sa-1');
    service.fecha.set('2026-03-09');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-03-09`).flush(respuestaSinConflictos);
    await vi.waitFor(() => expect(service.disponibilidad.data()?.salon_id).toBe('sa-1'));

    service.salonId.set('sa-2');
    await cederMicrotask();

    const otraRespuesta = { ...respuestaSinConflictos, salon_id: 'sa-2' };
    httpMock.expectOne(`${BASE_URL}/salon/sa-2?fecha=2026-03-09`).flush(otraRespuesta);

    await vi.waitFor(() => expect(service.disponibilidad.data()?.salon_id).toBe('sa-2'));
  });

  it('reacciona a un cambio de fecha: consulta el endpoint nuevo bajo su propia clave de caché', async () => {
    service.salonId.set('sa-1');
    service.fecha.set('2026-03-09');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-03-09`).flush(respuestaSinConflictos);
    await vi.waitFor(() => expect(service.disponibilidad.data()?.fecha).toBe('2026-03-09'));

    service.fecha.set('2026-03-16');
    await cederMicrotask();

    const otraRespuesta = { ...respuestaSinConflictos, fecha: '2026-03-16' };
    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-03-16`).flush(otraRespuesta);

    await vi.waitFor(() => expect(service.disponibilidad.data()?.fecha).toBe('2026-03-16'));
  });

  it('cada combinación salonId+fecha conserva su propia entrada de caché', async () => {
    const queryClient = TestBed.inject(QueryClient);

    service.salonId.set('sa-1');
    service.fecha.set('2026-03-09');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-03-09`).flush(respuestaSinConflictos);
    await vi.waitFor(() => expect(service.disponibilidad.data()).toBeTruthy());

    service.fecha.set('2026-03-16');
    await cederMicrotask();
    const otraRespuesta = { ...respuestaSinConflictos, fecha: '2026-03-16' };
    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-03-16`).flush(otraRespuesta);
    await vi.waitFor(() => expect(service.disponibilidad.data()?.fecha).toBe('2026-03-16'));

    expect(
      queryClient.getQueryData(disponibilidadQueryKeys.porSalonYFecha('sa-1', '2026-03-09')),
    ).toEqual(respuestaSinConflictos);
    expect(
      queryClient.getQueryData(disponibilidadQueryKeys.porSalonYFecha('sa-1', '2026-03-16')),
    ).toEqual(otraRespuesta);
  });
});
