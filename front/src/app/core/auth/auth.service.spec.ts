import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const REFRESH_TOKEN_STORAGE_KEY = 'llavero.refreshToken';
const EXCHANGE_URL = `${environment.apiBaseUrl}/auth/exchange`;
const REFRESH_URL = `${environment.apiBaseUrl}/auth/refresh`;
const ME_URL = `${environment.apiBaseUrl}/auth/me`;
const LOGOUT_URL = `${environment.apiBaseUrl}/auth/logout`;
const LOGIN_URL = `${environment.apiBaseUrl}/auth/login`;

const usuarioDto = {
  id: 'u-1',
  nombre: 'Ana',
  email_institucional: 'ana@uco.edu.co',
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
};

// `AuthService` encadena una segunda llamada HTTP (`/auth/me`) al resolver
// la primera (`/auth/exchange` o `/auth/refresh`) dentro de una función
// `async`. `flush()` resuelve el observable de forma síncrona, pero el
// `await` que reanuda la función async lo hace en un microtask aparte —
// sin `fakeAsync`/`tick()` (no disponibles con el runner Vitest de este
// scaffold), hay que cederle el control al event loop explícitamente antes
// de esperar la segunda request.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('login', () => {
    it('redirige el navegador a GET /api/auth/login', () => {
      // jsdom no permite `spyOn(window.location, 'assign')` directamente
      // (la propiedad no es reconfigurable) — se reemplaza el objeto
      // `location` completo por uno propio con un `assign` espiable.
      const assignMock = vi.fn();
      const locationOriginal = window.location;
      Object.defineProperty(window, 'location', {
        value: { ...locationOriginal, assign: assignMock },
        configurable: true,
      });

      service.login();

      expect(assignMock).toHaveBeenCalledWith(LOGIN_URL);

      Object.defineProperty(window, 'location', { value: locationOriginal, configurable: true });
    });
  });

  describe('exchange', () => {
    it('canjea el código opaco y persiste solo el refresh token', async () => {
      const promesa = service.exchange('codigo-opaco');

      const exchangeReq = httpMock.expectOne(EXCHANGE_URL);
      expect(exchangeReq.request.method).toBe('POST');
      expect(exchangeReq.request.body).toEqual({ codigo: 'codigo-opaco' });
      exchangeReq.flush({ access_token: 'access-1', refresh_token: 'refresh-1' });
      await cederMicrotask();

      const meReq = httpMock.expectOne(ME_URL);
      meReq.flush(usuarioDto);

      await promesa;

      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('access-1');
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-1');
      expect(service.currentUser()).toEqual({
        id: 'u-1',
        nombre: 'Ana',
        emailInstitucional: 'ana@uco.edu.co',
        rolId: 'r-1',
        ubicacionId: 'ub-1',
      });
    });

    it('no persiste el access token en localStorage', async () => {
      const promesa = service.exchange('codigo-opaco');
      httpMock.expectOne(EXCHANGE_URL).flush({ access_token: 'access-1', refresh_token: 'refresh-1' });
      await cederMicrotask();
      httpMock.expectOne(ME_URL).flush(usuarioDto);
      await promesa;

      expect(localStorage.getItem('access-1')).toBeNull();
      expect(JSON.stringify(localStorage)).not.toContain('access-1');
    });
  });

  describe('refresh', () => {
    it('dispara un único POST /auth/refresh aunque se llame varias veces en simultáneo', async () => {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-viejo');

      const primeraLlamada = service.refresh();
      const segundaLlamada = service.refresh();
      const terceraLlamada = service.refresh();

      httpMock.expectOne(REFRESH_URL).flush({ access_token: 'access-2', refresh_token: 'refresh-2' });

      const resultados = await Promise.all([primeraLlamada, segundaLlamada, terceraLlamada]);

      expect(resultados).toEqual(['access-2', 'access-2', 'access-2']);
      httpMock.expectNone(REFRESH_URL);
    });

    it('permite un nuevo refresh una vez que el anterior terminó', async () => {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-viejo');

      const primeraLlamada = service.refresh();
      httpMock.expectOne(REFRESH_URL).flush({ access_token: 'access-2', refresh_token: 'refresh-2' });
      await primeraLlamada;

      const segundaLlamada = service.refresh();
      httpMock.expectOne(REFRESH_URL).flush({ access_token: 'access-3', refresh_token: 'refresh-3' });
      await segundaLlamada;

      expect(service.accessToken()).toBe('access-3');
    });

    it('rechaza sin llamar HTTP si no hay refresh token persistido', async () => {
      await expect(service.refresh()).rejects.toThrow();
      httpMock.expectNone(REFRESH_URL);
    });
  });

  describe('restoreSession', () => {
    it('no hace ninguna llamada HTTP si no hay refresh token persistido', async () => {
      await service.restoreSession();

      httpMock.expectNone(REFRESH_URL);
      httpMock.expectNone(ME_URL);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('restaura la sesión (refresh + me) si hay un refresh token persistido', async () => {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-viejo');

      const promesa = service.restoreSession();

      httpMock.expectOne(REFRESH_URL).flush({ access_token: 'access-1', refresh_token: 'refresh-1' });
      await cederMicrotask();
      httpMock.expectOne(ME_URL).flush(usuarioDto);

      await promesa;

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()?.nombre).toBe('Ana');
    });

    it('limpia la sesión si el refresh token persistido es inválido', async () => {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-invalido');

      const promesa = service.restoreSession();

      httpMock.expectOne(REFRESH_URL).flush({ detail: 'Credenciales inválidas' }, { status: 400, statusText: 'Bad Request' });

      await promesa;

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
    });
  });

  describe('logout', () => {
    it('revoca la sesión en el backend y limpia el estado local', async () => {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-1');

      const promesa = service.logout();

      const logoutReq = httpMock.expectOne(LOGOUT_URL);
      expect(logoutReq.request.body).toEqual({ refresh_token: 'refresh-1' });
      logoutReq.flush(null, { status: 204, statusText: 'No Content' });

      await promesa;

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('limpia el estado local aunque el backend falle (best-effort)', async () => {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-1');

      const promesa = service.logout();
      httpMock.expectOne(LOGOUT_URL).flush({ detail: 'error' }, { status: 400, statusText: 'Bad Request' });

      await promesa;

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('no llama HTTP si no hay refresh token persistido', async () => {
      await service.logout();
      httpMock.expectNone(LOGOUT_URL);
    });
  });
});
