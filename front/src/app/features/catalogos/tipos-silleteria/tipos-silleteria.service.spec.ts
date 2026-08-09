import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import { TiposSilleteriaService } from './tipos-silleteria.service';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/tipos-silleteria`;

// `injectQuery`/`injectMutation` de TanStack Angular Query suscriben y
// ejecutan su lado HTTP dentro de un `effect()`/scheduler de Angular que
// corre de forma asíncrona (no en el mismo tick síncrono en el que se
// inyecta el servicio o se llama `mutate*`) — hay que cederle el control al
// event loop antes de que la request exista en `HttpTestingController`
// (mismo patrón que `cederMicrotask` en core/auth/auth.service.spec.ts).
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('TiposSilleteriaService', () => {
  let service: TiposSilleteriaService;
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
    service = TestBed.inject(TiposSilleteriaService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('expone la lista de tipos de silletería obtenida de GET /catalogos/tipos-silleteria', async () => {
    httpMock.expectOne(BASE_URL).flush([{ id: 't-1', nombre: 'Fija' }]);

    await vi.waitFor(() => expect(service.tiposSilleteria.data()).toEqual([{ id: 't-1', nombre: 'Fija' }]));
  });

  it('crear invalida tipos-silleteria Y salones (no repite el bug del legacy, ver catalogos.md §8)', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({ nombre: 'Universitaria' });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: BASE_URL })
      .flush({ id: 't-2', nombre: 'Universitaria' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.tiposSilleteria });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.salones });
  });

  it('actualizar hace PATCH parcial e invalida salones', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.actualizar.mutateAsync({ id: 't-1', nombre: 'Renombrado' });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'PATCH', url: `${BASE_URL}/t-1` });
    expect(req.request.body).toEqual({ nombre: 'Renombrado' });
    req.flush({ id: 't-1', nombre: 'Renombrado' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.salones });
  });

  it('eliminar propaga el 400 del backend cuando el tipo sigue en uso por un salón', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.eliminar.mutateAsync('t-1');
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/t-1` })
      .flush(
        { detail: 'No se puede eliminar el tipo de silletería porque tiene salones asociados' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
