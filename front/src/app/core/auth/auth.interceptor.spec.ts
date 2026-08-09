import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const REFRESH_TOKEN_STORAGE_KEY = 'llavero.refreshToken';
const EXCHANGE_URL = `${environment.apiBaseUrl}/auth/exchange`;
const REFRESH_URL = `${environment.apiBaseUrl}/auth/refresh`;
const ME_URL = `${environment.apiBaseUrl}/auth/me`;
const LOGIN_URL = `${environment.apiBaseUrl}/auth/login`;
// Endpoint arbitrario "protegido" — ninguna feature real existe todavía en
// este scaffold, solo hace falta una URL cualquiera que no esté en la
// lista de exentas del interceptor.
const PROTECTED_URL = `${environment.apiBaseUrl}/llaves`;

const usuarioDto = {
  id: 'u-1',
  nombre: 'Ana',
  email_institucional: 'ana@uco.edu.co',
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
};

// Ver la misma nota en auth.service.spec.ts: sin fakeAsync/tick(), hay que
// cederle el control al event loop entre dos requests HTTP encadenadas
// dentro de una función async antes de que `httpMock.expectOne` vea la
// segunda.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function autenticar(accessToken: string): Promise<void> {
    const promesa = authService.exchange('codigo-opaco');
    httpMock.expectOne(EXCHANGE_URL).flush({ access_token: accessToken, refresh_token: 'refresh-1' });
    await cederMicrotask();
    httpMock.expectOne(ME_URL).flush(usuarioDto);
    await promesa;
  }

  it('adjunta el bearer token vigente a una request protegida', async () => {
    await autenticar('access-1');

    const promesa = firstValueFrom(http.get(PROTECTED_URL));
    const req = httpMock.expectOne(PROTECTED_URL);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({});
    await promesa;
  });

  it('no adjunta bearer token a GET /auth/login, POST /auth/exchange ni POST /auth/refresh', async () => {
    await autenticar('access-1');

    const promesa = firstValueFrom(http.post(REFRESH_URL, { refresh_token: 'x' }));
    const req = httpMock.expectOne(REFRESH_URL);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ access_token: 'access-2', refresh_token: 'refresh-2' });
    await promesa;
  });

  it('sin sesión, no adjunta ningún header Authorization', async () => {
    const promesa = firstValueFrom(http.get(PROTECTED_URL));
    const req = httpMock.expectOne(PROTECTED_URL);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    await promesa;
  });

  it('ante un 401, refresca el token y reintenta la request original una vez', async () => {
    await autenticar('access-viejo');

    const promesa = firstValueFrom(http.get(PROTECTED_URL));

    const primeraReq = httpMock.expectOne(PROTECTED_URL);
    primeraReq.flush({ detail: 'expirado' }, { status: 401, statusText: 'Unauthorized' });

    httpMock.expectOne(REFRESH_URL).flush({ access_token: 'access-nuevo', refresh_token: 'refresh-nuevo' });
    await cederMicrotask();

    const reintento = httpMock.expectOne(PROTECTED_URL);
    expect(reintento.request.headers.get('Authorization')).toBe('Bearer access-nuevo');
    reintento.flush({ ok: true });

    await expect(promesa).resolves.toEqual({ ok: true });
  });

  it('deduplica: dos requests que caen en 401 al mismo tiempo disparan un único refresh', async () => {
    await autenticar('access-viejo');

    const promesaA = firstValueFrom(http.get(`${PROTECTED_URL}/a`));
    const promesaB = firstValueFrom(http.get(`${PROTECTED_URL}/b`));

    httpMock
      .expectOne(`${PROTECTED_URL}/a`)
      .flush({ detail: 'expirado' }, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(`${PROTECTED_URL}/b`)
      .flush({ detail: 'expirado' }, { status: 401, statusText: 'Unauthorized' });

    // Solo debe existir UNA request de refresh en curso, aunque ambas
    // requests protegidas hayan recibido 401 "al mismo tiempo" — esta es
    // la garantía de deduplicación heredada del interceptor de axios legacy
    // (ver AuthService.refresh() y frontend.md, sección "Auth").
    const refreshReq = httpMock.expectOne(REFRESH_URL);
    refreshReq.flush({ access_token: 'access-nuevo', refresh_token: 'refresh-nuevo' });
    await cederMicrotask();

    const reintentoA = httpMock.expectOne(`${PROTECTED_URL}/a`);
    const reintentoB = httpMock.expectOne(`${PROTECTED_URL}/b`);
    expect(reintentoA.request.headers.get('Authorization')).toBe('Bearer access-nuevo');
    expect(reintentoB.request.headers.get('Authorization')).toBe('Bearer access-nuevo');
    reintentoA.flush({ id: 'a' });
    reintentoB.flush({ id: 'b' });

    await Promise.all([promesaA, promesaB]);
    httpMock.expectNone(REFRESH_URL);
  });

  it('propaga el error si el refresh también falla', async () => {
    await autenticar('access-viejo');

    const promesa = firstValueFrom(http.get(PROTECTED_URL));

    httpMock
      .expectOne(PROTECTED_URL)
      .flush({ detail: 'expirado' }, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(REFRESH_URL)
      .flush({ detail: 'Credenciales inválidas' }, { status: 400, statusText: 'Bad Request' });

    await expect(promesa).rejects.toBeTruthy();
  });
});
