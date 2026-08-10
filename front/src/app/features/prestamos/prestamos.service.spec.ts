import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { prestamosQueryKeys } from './prestamos-query-keys';
import { PrestamosService } from './prestamos.service';

const BASE_URL = `${environment.apiBaseUrl}/prestamos`;

// Ver la misma nota en llaves (llaves.service.spec.ts): `injectQuery`/
// `injectMutation` disparan su lado HTTP de forma asíncrona (un tick después
// de inyectar el servicio o de llamar `mutate*`), no en el mismo tick
// síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const prestamoDto = {
  id: 'pr-1',
  solicitante_id: 'p-1',
  usuario_prestamista_id: 'us-1',
  ubicacion_id: 'ub-1',
  estado: 'activo',
  fecha_creacion: '2026-08-09T14:30:00Z',
};

describe('PrestamosService', () => {
  let service: PrestamosService;
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
    service = TestBed.inject(PrestamosService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sin filtro de estado consulta la lista completa (GET /api/prestamos/)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoDto]);

    await vi.waitFor(() => expect(service.prestamos.data()).toEqual([prestamoDto]));
  });

  it('al fijar el filtro de estado consulta el endpoint por estado bajo su propia clave', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoDto]);
    await vi.waitFor(() => expect(service.prestamos.data()).toEqual([prestamoDto]));

    service.filtroEstado.set('completamente_devuelto');
    await cederMicrotask();

    const devuelto = { ...prestamoDto, id: 'pr-2', estado: 'completamente_devuelto' };
    httpMock.expectOne(`${BASE_URL}/estado/completamente_devuelto`).flush([devuelto]);

    await vi.waitFor(() => expect(service.prestamos.data()).toEqual([devuelto]));
    // La lista sin filtro sigue cacheada aparte: son dos claves distintas.
    expect(queryClient.getQueryData(prestamosQueryKeys.lista)).toEqual([prestamoDto]);
    expect(
      queryClient.getQueryData(prestamosQueryKeys.porEstado('completamente_devuelto')),
    ).toEqual([devuelto]);
  });

  it('crear hace POST a /api/prestamos/ con los equipo_ids e invalida el prefijo ["prestamos"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      solicitante_id: 'p-1',
      usuario_prestamista_id: 'us-1',
      ubicacion_id: 'ub-1',
      equipo_ids: ['eq-1', 'eq-2'],
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      solicitante_id: 'p-1',
      usuario_prestamista_id: 'us-1',
      ubicacion_id: 'ub-1',
      equipo_ids: ['eq-1', 'eq-2'],
    });
    req.flush(prestamoDto);
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: prestamosQueryKeys.raiz });
  });

  it('devolverEquipos hace POST a /{id}/devolver con el cuerpo sin el id e invalida el prefijo', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.devolverEquipos.mutateAsync({
      id: 'pr-1',
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1'],
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/pr-1/devolver` });
    expect(req.request.body).toEqual({
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1'],
    });
    req.flush({
      id: 'dev-1',
      prestamo_id: 'pr-1',
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      fecha: '2026-08-09T18:00:00Z',
      es_completa: false,
    });
    await promesa;

    // Una devolución cambia el estado del préstamo, sus detalles y sus
    // devoluciones: por eso se invalida el PREFIJO, no una clave puntual.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: prestamosQueryKeys.raiz });
    expect(prestamosQueryKeys.detalles('pr-1')[0]).toBe(prestamosQueryKeys.raiz[0]);
    expect(prestamosQueryKeys.devoluciones('pr-1')[0]).toBe(prestamosQueryKeys.raiz[0]);
  });

  it('devolverEquipos propaga el 400 del backend (ej. equipo que no pertenece al préstamo)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.devolverEquipos.mutateAsync({
      id: 'pr-1',
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-9'],
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/pr-1/devolver` })
      .flush(
        { detail: 'El equipo no pertenece a este préstamo' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
