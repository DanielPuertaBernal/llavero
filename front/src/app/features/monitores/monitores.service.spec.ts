import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { monitoresQueryKeys } from './monitores-query-keys';
import { MonitoresService } from './monitores.service';

const BASE_URL = `${environment.apiBaseUrl}/monitores`;

// Ver la misma nota en usuarios/reservas (usuarios.service.spec.ts):
// `injectQuery`/`injectMutation` disparan su lado HTTP de forma asíncrona (un
// tick después de inyectar el servicio o de llamar `mutate*`), no en el
// mismo tick síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const monitorDto = {
  id: 'mo-1',
  docente_titular_id: 'p-1',
  monitor_delegado_id: 'p-2',
  materia: 'Estructuras de Datos',
  aula: 'B-201',
  dia: 'lunes',
  horario: '14:00 - 16:00',
  activo: true,
};

describe('MonitoresService', () => {
  let service: MonitoresService;
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
    service = TestBed.inject(MonitoresService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta la lista completa (GET /api/monitores/) — no hay endpoint por estado', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([monitorDto]);

    await vi.waitFor(() => expect(service.monitores.data()).toEqual([monitorDto]));
  });

  it('crear hace POST a /api/monitores/ con el cuerpo de MonitorIn e invalida el prefijo ["monitores"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      docente_titular_id: 'p-1',
      monitor_delegado_id: 'p-2',
      materia: 'Estructuras de Datos',
      aula: 'B-201',
      dia: 'lunes',
      horario: '14:00 - 16:00',
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      docente_titular_id: 'p-1',
      monitor_delegado_id: 'p-2',
      materia: 'Estructuras de Datos',
      aula: 'B-201',
      dia: 'lunes',
      horario: '14:00 - 16:00',
    });
    req.flush(monitorDto);
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: monitoresQueryKeys.raiz });
  });

  it('crear omite los campos opcionales cuando no se completan', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      docente_titular_id: 'p-1',
      monitor_delegado_id: 'p-2',
      materia: 'Estructuras de Datos',
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      docente_titular_id: 'p-1',
      monitor_delegado_id: 'p-2',
      materia: 'Estructuras de Datos',
    });
    req.flush({ ...monitorDto, aula: null, dia: null, horario: null });
    await promesa;
  });

  it('crear propaga el 400 del backend cuando docente titular y monitor delegado son la misma persona', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      docente_titular_id: 'p-1',
      monitor_delegado_id: 'p-1',
      materia: 'Estructuras de Datos',
    });
    await cederMicrotask();
    httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` }).flush(
      { detail: 'El docente titular y el monitor delegado deben ser personas distintas' },
      { status: 400, statusText: 'Bad Request' },
    );

    await expect(promesa).rejects.toBeTruthy();
  });

  it('desactivar hace POST a /api/monitores/{id}/desactivar sin cuerpo e invalida el prefijo ["monitores"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.desactivar.mutateAsync('mo-1');
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/mo-1/desactivar` });
    expect(req.request.body).toBeNull();
    req.flush({ ...monitorDto, activo: false });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: monitoresQueryKeys.raiz });
  });

  it('desactivar propaga el 404 del backend cuando la monitoría no existe', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.desactivar.mutateAsync('mo-inexistente');
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/mo-inexistente/desactivar` })
      .flush({ detail: 'Monitor no encontrado' }, { status: 404, statusText: 'Not Found' });

    await expect(promesa).rejects.toBeTruthy();
  });
});

// Sin `TestBed`: son aserciones sobre constantes puras. Van en su propio
// `describe` para no arrastrar el `beforeEach` que inyecta el servicio (y
// que dejaría abierta la petición de la lista ante `httpMock.verify()`).
describe('monitoresQueryKeys', () => {
  it('la clave de la lista cuelga del prefijo ["monitores"] que invalida el servicio', () => {
    expect(monitoresQueryKeys.lista.slice(0, monitoresQueryKeys.raiz.length)).toEqual([
      ...monitoresQueryKeys.raiz,
    ]);
  });

  it('el lookup de personas NO cuelga de ["monitores"] (una mutación de monitores no lo invalida)', () => {
    expect(monitoresQueryKeys.lookupPersonas[0]).not.toBe(monitoresQueryKeys.raiz[0]);
  });

  it('las clases del docente titular NO cuelgan de ["monitores"] (son un dato de programacion)', () => {
    expect(monitoresQueryKeys.clasesDocenteTitular('mo-1')[0]).not.toBe(
      monitoresQueryKeys.raiz[0],
    );
    // Cada monitoría tiene su propia entrada de caché.
    expect(monitoresQueryKeys.clasesDocenteTitular('mo-1')).not.toEqual(
      monitoresQueryKeys.clasesDocenteTitular('mo-2'),
    );
  });
});
