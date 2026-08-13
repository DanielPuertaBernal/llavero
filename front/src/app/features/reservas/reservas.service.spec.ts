import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { reservasQueryKeys } from './reservas-query-keys';
import { ReservasService } from './reservas.service';

const BASE_URL = `${environment.apiBaseUrl}/reservas`;

// Ver la misma nota en prestamos (prestamos.service.spec.ts): `injectQuery`/
// `injectMutation` disparan su lado HTTP de forma asíncrona (un tick después
// de inyectar el servicio o de llamar `mutate*`), no en el mismo tick
// síncrono.
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

describe('ReservasService', () => {
  let service: ReservasService;
  let httpMock: HttpTestingController;
  let queryClient: QueryClient;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    queryClient = TestBed.inject(QueryClient);
    service = TestBed.inject(ReservasService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sin filtro de solicitante consulta la lista completa (GET /api/reservas/)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaDto]);

    await vi.waitFor(() => expect(service.reservas.data()).toEqual([reservaDto]));
  });

  it('al fijar el filtro de solicitante consulta su endpoint bajo su propia clave', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaDto]);
    await vi.waitFor(() => expect(service.reservas.data()).toEqual([reservaDto]));

    service.filtroSolicitante.set('p-9');
    await cederMicrotask();

    const deOtro = { ...reservaDto, id: 'rv-2', solicitante_id: 'p-9' };
    httpMock.expectOne(`${BASE_URL}/solicitante/p-9`).flush([deOtro]);

    await vi.waitFor(() => expect(service.reservas.data()).toEqual([deOtro]));
    // La lista sin filtro sigue cacheada aparte: son dos claves distintas.
    expect(queryClient.getQueryData(reservasQueryKeys.lista)).toEqual([reservaDto]);
    expect(queryClient.getQueryData(reservasQueryKeys.porSolicitante('p-9'))).toEqual([deOtro]);
  });

  it('al fijar el filtro de estado consulta el endpoint por estado bajo su propia clave', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaDto]);
    await vi.waitFor(() => expect(service.reservas.data()).toEqual([reservaDto]));

    service.filtroEstado.set('cancelada');
    await cederMicrotask();

    const cancelada = { ...reservaDto, id: 'rv-3', estado: 'cancelada' };
    httpMock.expectOne(`${BASE_URL}/estado/cancelada`).flush([cancelada]);

    await vi.waitFor(() => expect(service.reservas.data()).toEqual([cancelada]));
    // La lista sin filtro sigue cacheada aparte: son dos claves distintas.
    expect(queryClient.getQueryData(reservasQueryKeys.lista)).toEqual([reservaDto]);
    expect(queryClient.getQueryData(reservasQueryKeys.porEstado('cancelada'))).toEqual([
      cancelada,
    ]);
  });

  it('con filtroEstado y filtroSolicitante fijados a la vez, filtroEstado tiene precedencia', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaDto]);
    await vi.waitFor(() => expect(service.reservas.data()).toEqual([reservaDto]));

    service.filtroSolicitante.set('p-9');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/solicitante/p-9`).flush([reservaDto]);
    await vi.waitFor(() => expect(service.reservas.data()).toEqual([reservaDto]));

    service.filtroEstado.set('cancelada');
    await cederMicrotask();

    const cancelada = { ...reservaDto, id: 'rv-3', estado: 'cancelada' };
    httpMock.expectOne(`${BASE_URL}/estado/cancelada`).flush([cancelada]);

    await vi.waitFor(() => expect(service.reservas.data()).toEqual([cancelada]));
  });

  it('crear hace POST a /api/reservas/ con el cuerpo tal cual e invalida el prefijo ["reservas"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: '2026-08-20',
      hora_inicio: '08:00:00',
      hora_fin: '10:00:00',
      motivo: 'Asesoría de tesis',
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: '2026-08-20',
      hora_inicio: '08:00:00',
      hora_fin: '10:00:00',
      motivo: 'Asesoría de tesis',
    });
    req.flush(reservaDto, { status: 201, statusText: 'Created' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reservasQueryKeys.raiz });
  });

  it('crear propaga el 400 del backend (ej. franja solapada con otra reserva aprobada)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      fecha: '2026-08-20',
      hora_inicio: '08:00:00',
      hora_fin: '10:00:00',
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush(
        { detail: 'La franja 08:00:00-10:00:00 se solapa con otra reserva ya aprobada' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });

  it('cancelar hace POST a /{id}/cancelar SIN cuerpo e invalida el prefijo', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.cancelar.mutateAsync({ id: 'rv-1' });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/rv-1/cancelar` });
    // El endpoint no declara schema de entrada (ver back/reservas/
    // controller.py): no se inventa un cuerpo con campos que el backend
    // ignoraría.
    expect(req.request.body).toBeNull();
    req.flush({ ...reservaDto, estado: 'cancelada' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reservasQueryKeys.raiz });
    // La lista por solicitante también cuelga del prefijo: una cancelación la
    // desactualiza igual que a la lista completa.
    expect(reservasQueryKeys.porSolicitante('p-1')[0]).toBe(reservasQueryKeys.raiz[0]);
  });

  it('cancelar propaga el 400 del backend (ej. reserva que no está aprobada)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.cancelar.mutateAsync({ id: 'rv-1' });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/rv-1/cancelar` })
      .flush(
        { detail: "No se puede cancelar una reserva en estado 'completada'" },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
