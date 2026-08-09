import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import { UbicacionesService } from './ubicaciones.service';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/ubicaciones`;

const ubicacionDto = {
  id: 'u-1',
  nombre: 'Biblioteca',
  permite_prestamo_llaves: true,
  permite_devolucion_llaves: true,
  permite_prestamo_equipos: false,
};

// Ver la misma nota en bloques.service.spec.ts: `injectQuery`/
// `injectMutation` disparan su lado HTTP de forma asíncrona (un tick
// después de inyectar el servicio o de llamar `mutate*`), no en el mismo
// tick síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('UbicacionesService', () => {
  let service: UbicacionesService;
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
    service = TestBed.inject(UbicacionesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('expone la lista de ubicaciones con los 3 flags de permiso', async () => {
    httpMock.expectOne(BASE_URL).flush([ubicacionDto]);

    await vi.waitFor(() => expect(service.ubicaciones.data()).toEqual([ubicacionDto]));
  });

  it('crear invalida únicamente su propia queryKey (ubicacion no es denormalizada en otra entidad)', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      nombre: 'Portería',
      permite_prestamo_llaves: true,
      permite_devolucion_llaves: true,
      permite_prestamo_equipos: false,
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: BASE_URL })
      .flush({ id: 'u-2', nombre: 'Portería', permite_prestamo_llaves: true, permite_devolucion_llaves: true, permite_prestamo_equipos: false });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.ubicaciones });
  });

  it('actualizar envía solo los campos provistos (partial update)', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.actualizar.mutateAsync({ id: 'u-1', permite_prestamo_equipos: true });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'PATCH', url: `${BASE_URL}/u-1` });
    expect(req.request.body).toEqual({ permite_prestamo_equipos: true });
    req.flush({ ...ubicacionDto, permite_prestamo_equipos: true });
    await promesa;
  });

  it('eliminar propaga el 400 del backend cuando la ubicación sigue en uso', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.eliminar.mutateAsync('u-1');
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/u-1` })
      .flush(
        { detail: 'No se puede eliminar la ubicación porque está en uso' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
