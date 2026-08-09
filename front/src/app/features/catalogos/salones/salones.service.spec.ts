import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { catalogosQueryKeys } from '../catalogos-query-keys';
import { SalonesService } from './salones.service';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/salones`;

const salonDto = {
  id: 's-1',
  nombre: 'Aula 101',
  bloque_id: 'b-1',
  tipo_silleteria_id: 't-1',
  cantidad_sillas: 30,
  cantidad_mesas: 1,
};

// Ver la misma nota en bloques.service.spec.ts: `injectQuery`/
// `injectMutation` disparan su lado HTTP de forma asíncrona (un tick
// después de inyectar el servicio o de llamar `mutate*`), no en el mismo
// tick síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SalonesService', () => {
  let service: SalonesService;
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
    service = TestBed.inject(SalonesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('expone la lista de salones obtenida de GET /catalogos/salones', async () => {
    httpMock.expectOne(BASE_URL).flush([salonDto]);

    await vi.waitFor(() => expect(service.salones.data()).toEqual([salonDto]));
  });

  it('crear envía nombre/bloque_id/tipo_silleteria_id/cantidades e invalida salones', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      nombre: 'Aula 102',
      bloque_id: 'b-1',
      tipo_silleteria_id: 't-1',
      cantidad_sillas: 25,
      cantidad_mesas: 0,
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: BASE_URL });
    expect(req.request.body).toEqual({
      nombre: 'Aula 102',
      bloque_id: 'b-1',
      tipo_silleteria_id: 't-1',
      cantidad_sillas: 25,
      cantidad_mesas: 0,
    });
    req.flush({ ...salonDto, id: 's-2', nombre: 'Aula 102' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: catalogosQueryKeys.salones });
  });

  it('crear propaga el 400 del backend cuando bloque_id/tipo_silleteria_id no existen', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      nombre: 'Aula X',
      bloque_id: 'no-existe',
      tipo_silleteria_id: 't-1',
      cantidad_sillas: 0,
      cantidad_mesas: 0,
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: BASE_URL })
      .flush({ detail: 'No existe un bloque con id no-existe' }, { status: 400, statusText: 'Bad Request' });

    await expect(promesa).rejects.toBeTruthy();
  });

  it('eliminar propaga el 400 cuando el salón está protegido por llaves/reservas/programación', async () => {
    httpMock.expectOne(BASE_URL).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.eliminar.mutateAsync('s-1');
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/s-1` })
      .flush(
        { detail: 'No se puede eliminar el salon porque tiene registros asociados' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
