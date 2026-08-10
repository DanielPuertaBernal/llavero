import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { usuariosQueryKeys } from './usuarios-query-keys';
import { UsuariosService } from './usuarios.service';

const BASE_URL = `${environment.apiBaseUrl}/usuarios`;

// Ver la misma nota en llaves/prestamos (llaves.service.spec.ts):
// `injectQuery`/`injectMutation` disparan su lado HTTP de forma asíncrona
// (un tick después de inyectar el servicio o de llamar `mutate*`), no en el
// mismo tick síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioDto = {
  id: 'us-1',
  nombre: 'Ana Vigilante',
  email_institucional: 'ana@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};

describe('UsuariosService', () => {
  let service: UsuariosService;
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
    service = TestBed.inject(UsuariosService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta la lista completa (GET /api/usuarios/) — no hay endpoint por estado', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([usuarioDto]);

    await vi.waitFor(() => expect(service.usuarios.data()).toEqual([usuarioDto]));
  });

  it('crear hace POST a /api/usuarios/ con el cuerpo de UsuarioIn e invalida el prefijo ["usuarios"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      nombre: 'Bruno Portería',
      email_institucional: 'bruno@uco.edu.co',
      rol_id: 'r-1',
      ubicacion_id: 'ub-1',
      activo: true,
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      nombre: 'Bruno Portería',
      email_institucional: 'bruno@uco.edu.co',
      rol_id: 'r-1',
      ubicacion_id: 'ub-1',
      activo: true,
    });
    req.flush({ ...usuarioDto, id: 'us-2' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: usuariosQueryKeys.raiz });
  });

  it('desactivar hace POST a /api/usuarios/{id}/desactivar con solo usuario_actual_id en el cuerpo', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.desactivar.mutateAsync({
      id: 'us-1',
      usuario_actual_id: 'us-9',
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/us-1/desactivar` });
    // El id del objetivo viaja en la URL, nunca en el cuerpo: `DesactivarUsuarioIn`
    // solo declara `usuario_actual_id` (ver back/usuarios/controller.py).
    expect(req.request.body).toEqual({ usuario_actual_id: 'us-9' });
    req.flush({ ...usuarioDto, activo: false });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: usuariosQueryKeys.raiz });
  });

  it('desactivar propaga el 400 de autoprotección del backend (no puede desactivarse a sí mismo)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.desactivar.mutateAsync({
      id: 'us-1',
      usuario_actual_id: 'us-1',
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/us-1/desactivar` })
      .flush(
        { detail: 'Un usuario no puede desactivarse a sí mismo' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});

// Sin `TestBed`: son aserciones sobre constantes puras. Van en su propio
// `describe` para no arrastrar el `beforeEach` que inyecta el servicio (y
// que dejaría abierta la petición de la lista ante `httpMock.verify()`).
describe('usuariosQueryKeys', () => {
  it('la clave de la lista cuelga del prefijo ["usuarios"] que invalida el servicio', () => {
    // `invalidar()` es privado a propósito; lo que este test fija es la
    // RELACIÓN entre claves: `lista` cuelga de `raiz`, así que invalidar el
    // prefijo alcanza a la lista sin enumerar claves puntuales.
    expect(usuariosQueryKeys.lista.slice(0, usuariosQueryKeys.raiz.length)).toEqual([
      ...usuariosQueryKeys.raiz,
    ]);
  });

  it('los lookups NO cuelgan de ["usuarios"] (una mutación de usuarios no los invalida)', () => {
    expect(usuariosQueryKeys.lookupRoles[0]).not.toBe(usuariosQueryKeys.raiz[0]);
    expect(usuariosQueryKeys.lookupUbicaciones[0]).not.toBe(usuariosQueryKeys.raiz[0]);
  });
});
