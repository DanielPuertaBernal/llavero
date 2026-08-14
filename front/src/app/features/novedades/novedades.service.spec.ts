import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { novedadesQueryKeys } from './novedades-query-keys';
import { NovedadesService } from './novedades.service';

const BASE_URL = `${environment.apiBaseUrl}/novedades`;

// Ver la misma nota en usuarios/monitores/reservas (*.service.spec.ts):
// `injectQuery`/`injectMutation` disparan su lado HTTP de forma asíncrona (un
// tick después de inyectar el servicio o de llamar `mutate*`), no en el mismo
// tick síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const novedadDto = {
  id: 'nv-1',
  categoria: 'dano',
  descripcion: 'Llave doblada',
  estado: 'abierta',
  solucion: null,
  registrado_por_id: 'us-1',
};

describe('NovedadesService', () => {
  let service: NovedadesService;
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
    service = TestBed.inject(NovedadesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sin filtros consulta la lista completa (GET /api/novedades/)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([novedadDto]);

    await vi.waitFor(() => expect(service.novedades.data()).toEqual([novedadDto]));
  });

  it('con filtroEstado fijado consulta GET /api/novedades/estado/{estado}', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);

    service.filtroEstado.set('cerrada');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/estado/cerrada`).flush([{ ...novedadDto, estado: 'cerrada' }]);
    await vi.waitFor(() =>
      expect(service.novedades.data()).toEqual([{ ...novedadDto, estado: 'cerrada' }]),
    );
  });

  it('con filtroCategoria fijado consulta GET /api/novedades/categoria/{categoria}', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);

    service.filtroCategoria.set('perdida');
    await cederMicrotask();

    httpMock
      .expectOne(`${BASE_URL}/categoria/perdida`)
      .flush([{ ...novedadDto, categoria: 'perdida' }]);
    await vi.waitFor(() =>
      expect(service.novedades.data()).toEqual([{ ...novedadDto, categoria: 'perdida' }]),
    );
  });

  it('con ambos filtros fijados a la vez, estado gana como cinturón de seguridad', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);

    service.filtroCategoria.set('perdida');
    service.filtroEstado.set('cerrada');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/estado/cerrada`).flush([{ ...novedadDto, estado: 'cerrada' }]);
    httpMock.expectNone(`${BASE_URL}/categoria/perdida`);
  });

  it('crear hace POST a /api/novedades/ con el cuerpo de NovedadIn e invalida el prefijo ["novedades"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      categoria: 'dano',
      registrado_por_id: 'us-1',
      descripcion: 'Llave doblada',
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      categoria: 'dano',
      registrado_por_id: 'us-1',
      descripcion: 'Llave doblada',
    });
    req.flush(novedadDto);
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: novedadesQueryKeys.raiz });
  });

  it('crear propaga el 400 del backend cuando registrado_por_id no existe', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      categoria: 'otro',
      registrado_por_id: 'us-inexistente',
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush({ detail: 'El usuario no existe' }, { status: 400, statusText: 'Bad Request' });

    await expect(promesa).rejects.toBeTruthy();
  });

  it('cerrar hace POST a /{id}/cerrar con solo solucion en el cuerpo e invalida el prefijo ["novedades"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.cerrar.mutateAsync({ id: 'nv-1', solucion: 'Se reemplazó la llave' });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/nv-1/cerrar` });
    // El id de la novedad viaja en la URL, nunca en el cuerpo: `CerrarNovedadIn`
    // solo declara `solucion` (ver back/novedades/controller.py).
    expect(req.request.body).toEqual({ solucion: 'Se reemplazó la llave' });
    req.flush({ ...novedadDto, estado: 'cerrada', solucion: 'Se reemplazó la llave' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: novedadesQueryKeys.raiz });
  });

  it('cerrar propaga el 400 del backend cuando la solucion viene vacía', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.cerrar.mutateAsync({ id: 'nv-1', solucion: '' });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/nv-1/cerrar` })
      .flush({ detail: 'La solución no puede estar vacía' }, { status: 400, statusText: 'Bad Request' });

    await expect(promesa).rejects.toBeTruthy();
  });

  it('cerrar propaga el 404 del backend cuando la novedad no existe', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.cerrar.mutateAsync({ id: 'nv-x', solucion: 'algo' });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/nv-x/cerrar` })
      .flush({ detail: 'Novedad no encontrada' }, { status: 404, statusText: 'Not Found' });

    await expect(promesa).rejects.toBeTruthy();
  });
});

// Sin `TestBed`: son aserciones sobre constantes puras. Van en su propio
// `describe` para no arrastrar el `beforeEach` que inyecta el servicio (y
// que dejaría abierta la petición de la lista ante `httpMock.verify()`).
describe('novedadesQueryKeys', () => {
  it('las claves de lista/estado/categoría cuelgan del prefijo ["novedades"] que invalida el servicio', () => {
    expect(novedadesQueryKeys.lista.slice(0, novedadesQueryKeys.raiz.length)).toEqual([
      ...novedadesQueryKeys.raiz,
    ]);
    expect(novedadesQueryKeys.porEstado('cerrada').slice(0, novedadesQueryKeys.raiz.length)).toEqual(
      [...novedadesQueryKeys.raiz],
    );
    expect(
      novedadesQueryKeys.porCategoria('dano').slice(0, novedadesQueryKeys.raiz.length),
    ).toEqual([...novedadesQueryKeys.raiz]);
  });

  it('el lookup de usuarios NO cuelga de ["novedades"] (una mutación de novedades no lo invalida)', () => {
    expect(novedadesQueryKeys.lookupUsuarios[0]).not.toBe(novedadesQueryKeys.raiz[0]);
  });
});
