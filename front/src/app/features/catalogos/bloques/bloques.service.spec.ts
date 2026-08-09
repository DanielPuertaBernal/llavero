import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import { BloquesService } from './bloques.service';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/bloques`;

// `injectQuery` suscribe su observer dentro de un `effect()` de Angular, que
// se agenda de forma asíncrona (no corre en el mismo tick síncrono en el
// que se inyecta el servicio) — hay que cederle el control al event loop
// antes de que la request GET eager de la query de listado exista en
// `HttpTestingController` (mismo patrón que `cederMicrotask` en
// core/auth/auth.service.spec.ts, para otro tipo de encadenamiento async).
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('BloquesService', () => {
  let service: BloquesService;
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
    service = TestBed.inject(BloquesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('expone la lista de bloques obtenida de GET /catalogos/bloques', async () => {
    httpMock.expectOne(BASE_URL).flush([{ id: 'b-1', nombre: 'Bloque A' }]);

    await vi.waitFor(() =>
      expect(service.bloques.data()).toEqual([{ id: 'b-1', nombre: 'Bloque A' }]),
    );
  });

  it('crear invalida tanto bloques como salones tras un POST exitoso', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({ nombre: 'Bloque nuevo' });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: BASE_URL });
    expect(req.request.body).toEqual({ nombre: 'Bloque nuevo' });
    req.flush({ id: 'b-2', nombre: 'Bloque nuevo' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.bloques });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.salones });
  });

  it('actualizar hace PATCH solo con los campos provistos (partial update) e invalida salones', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.actualizar.mutateAsync({ id: 'b-1', nombre: 'Renombrado' });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'PATCH', url: `${BASE_URL}/b-1` });
    expect(req.request.body).toEqual({ nombre: 'Renombrado' });
    req.flush({ id: 'b-1', nombre: 'Renombrado' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.salones });
  });

  it('eliminar hace DELETE y también invalida salones', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.eliminar.mutateAsync('b-1');
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/b-1` })
      .flush(null, { status: 204, statusText: 'No Content' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.bloques });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.salones });
  });

  it('propaga el 400 del backend cuando el bloque sigue referenciado por un salón', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.eliminar.mutateAsync('b-1');
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/b-1` })
      .flush(
        { detail: 'No se puede eliminar el bloque porque tiene salones asociados' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
