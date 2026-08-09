import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { llavesQueryKeys } from './llaves-query-keys';
import { LlavesService } from './llaves.service';

const BASE_URL = `${environment.apiBaseUrl}/llaves`;

// Ver la misma nota en catalogos (bloques.service.spec.ts): `injectQuery`/
// `injectMutation` disparan su lado HTTP de forma asíncrona (un tick
// después de inyectar el servicio o de llamar `mutate*`), no en el mismo
// tick síncrono.
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

describe('LlavesService', () => {
  let service: LlavesService;
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
    service = TestBed.inject(LlavesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sin filtro de estado consulta la lista completa (GET /api/llaves/)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveDto]);

    await vi.waitFor(() => expect(service.llaves.data()).toEqual([llaveDto]));
  });

  it('al fijar el filtro de estado consulta el endpoint por estado bajo su propia clave', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveDto]);
    await vi.waitFor(() => expect(service.llaves.data()).toEqual([llaveDto]));

    service.filtroEstado.set('entregado');
    await cederMicrotask();

    const entregada = { ...llaveDto, id: 'l-2', estado: 'entregado' };
    httpMock.expectOne(`${BASE_URL}/estado/entregado`).flush([entregada]);

    await vi.waitFor(() => expect(service.llaves.data()).toEqual([entregada]));
    // La lista sin filtro sigue cacheada aparte: son dos claves distintas.
    expect(queryClient.getQueryData(llavesQueryKeys.lista)).toEqual([llaveDto]);
    expect(queryClient.getQueryData(llavesQueryKeys.porEstado('entregado'))).toEqual([entregada]);
  });

  it('crear hace POST a /api/llaves/ e invalida la raíz (lista y listas por estado)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      salon_id: 's-1',
      docente_titular_id: 'p-1',
      reclamado_por_id: 'p-2',
      origen: 'manual',
      tipo_entrega: 'credencial',
      usuario_entrega_id: 'us-1',
      ubicacion_entrega_id: 'ub-1',
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
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
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: llavesQueryKeys.raiz });
  });

  it('devolver hace POST a /api/llaves/{id}/devolver con el cuerpo sin el id', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.devolver.mutateAsync({
      id: 'l-1',
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'manual',
      novedad_id: null,
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/l-1/devolver` });
    expect(req.request.body).toEqual({
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'manual',
      novedad_id: null,
    });
    req.flush({ ...llaveDto, estado: 'entregado' });
    await promesa;
  });

  it('devolver propaga el 400 del backend (ej. la llave ya fue devuelta)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.devolver.mutateAsync({
      id: 'l-1',
      usuario_recibe_id: 'us-2',
      ubicacion_devolucion_id: 'ub-2',
      tipo_devolucion: 'manual',
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/l-1/devolver` })
      .flush({ detail: 'La llave ya fue devuelta' }, { status: 400, statusText: 'Bad Request' });

    await expect(promesa).rejects.toBeTruthy();
  });
});
