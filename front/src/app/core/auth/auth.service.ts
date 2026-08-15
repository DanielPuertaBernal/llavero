import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { TokenPairDto, UsuarioAutenticado, UsuarioAutenticadoDto } from './auth.models';

// Persistimos solo el refresh token — mismo patrón que el `authStore`
// Zustand del legacy (ver AulaSync/analisis/estrategia-migracion/frontend.md,
// "Auth"): el access token vive nada más en memoria (signal), nunca en
// localStorage, para reducir su superficie de robo (XSS).
const REFRESH_TOKEN_STORAGE_KEY = 'llavero.refreshToken';

/**
 * Sesión de autenticación de Llavero (Office 365 vía backend, ver
 * back/auth/service.py). Sin MSAL en el frontend: el backend resuelve todo
 * el intercambio Authorization Code con Microsoft; este servicio solo:
 *
 * 1. `login()` — redirige a `GET /api/auth/login`.
 * 2. `exchange(codigo)` — canjea el código opaco de un solo uso que el
 *    backend deja en la query string de `FRONTEND_POST_LOGIN_REDIRECT_URL`
 *    (ver `AuthCallbackComponent`) por el par de JWT propios.
 * 3. `refresh()` — rota el refresh token cuando el access token expira,
 *    deduplicando llamadas concurrentes (ver `refreshInFlight` abajo).
 * 4. `restoreSession()` — al arrancar la app, si hay un refresh token
 *    persistido, intenta un refresh silencioso antes de renderizar
 *    (conectado como `provideAppInitializer` en `app.config.ts`).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly currentUserSignal = signal<UsuarioAutenticado | null>(null);

  /**
   * Promesa compartida del refresh en curso, si hay uno. Esta es la
   * garantía de deduplicación que preserva el comportamiento del
   * interceptor de axios legacy (frontend.md, sección "Auth"): si N
   * requests reciben 401 al mismo tiempo, `authInterceptor` llama a
   * `refresh()` N veces, pero todas reciben esta misma promesa en vez de
   * disparar N llamadas HTTP a `/auth/refresh` (que además rotaría el
   * refresh token N veces y invalidaría las siguientes por single-use).
   */
  private refreshInFlight: Promise<string> | null = null;

  readonly accessToken = computed(() => this.accessTokenSignal());
  readonly isAuthenticated = computed(() => this.accessTokenSignal() !== null);
  readonly currentUser = computed(() => this.currentUserSignal());

  /**
   * Redirige el navegador al login federado (backend, no MSAL). Si se pasa
   * `email` (institucional, validado en `LoginComponent`), se agrega como
   * `login_hint` en la query string para prellenar el formulario de
   * Microsoft — sin `email`, la URL queda igual que siempre (regresión).
   */
  login(email?: string): void {
    const url = email
      ? `${environment.apiBaseUrl}/auth/login?login_hint=${encodeURIComponent(email)}`
      : `${environment.apiBaseUrl}/auth/login`;
    window.location.assign(url);
  }

  /**
   * Canjea el código opaco de un solo uso recibido en la query string del
   * post-login redirect por el par de JWT propios (`POST /api/auth/exchange`,
   * ver back/auth/controller.py). Lanza si el código es inválido/usado/expirado.
   */
  async exchange(codigo: string): Promise<void> {
    const par = await firstValueFrom(
      this.http.post<TokenPairDto>(`${environment.apiBaseUrl}/auth/exchange`, { codigo }),
    );
    this.aplicarParDeTokens(par);
    await this.cargarUsuarioActual();
  }

  /**
   * Rota el refresh token y obtiene un access token nuevo
   * (`POST /api/auth/refresh`). Deduplicado: llamadas concurrentes
   * reutilizan la misma promesa en curso en vez de disparar refresh
   * duplicados.
   */
  refresh(): Promise<string> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshTokenPersistido = this.leerRefreshTokenPersistido();
    if (!refreshTokenPersistido) {
      this.limpiarSesion();
      return Promise.reject(new Error('No hay sesión que refrescar'));
    }

    this.refreshInFlight = this.ejecutarRefresh(refreshTokenPersistido).finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }

  /**
   * Se conecta como `provideAppInitializer` (ver app.config.ts): si hay un
   * refresh token persistido de una sesión anterior, intenta restaurarla
   * (refresh + `/auth/me`) antes de que la app renderice, para no forzar
   * un re-login en cada carga de página.
   */
  async restoreSession(): Promise<void> {
    if (!this.leerRefreshTokenPersistido()) {
      return;
    }
    try {
      await this.refresh();
      await this.cargarUsuarioActual();
    } catch {
      // Refresh token inválido/reusado/expirado: sesión no recuperable,
      // continuar como usuario anónimo (mismo comportamiento que el
      // `restoreSession()` legacy, ver frontend.md).
      this.limpiarSesion();
    }
  }

  /**
   * Revoca la sesión de refresh en el backend (best-effort: un refresh ya
   * inválido no debe bloquear el logout local, ver
   * `auth.service.cerrar_sesion` en el backend) y limpia el estado local.
   */
  async logout(): Promise<void> {
    const refreshTokenPersistido = this.leerRefreshTokenPersistido();
    if (refreshTokenPersistido) {
      try {
        await firstValueFrom(
          this.http.post(`${environment.apiBaseUrl}/auth/logout`, {
            refresh_token: refreshTokenPersistido,
          }),
        );
      } catch {
        // Ver docstring de la clase: logout es best-effort del lado cliente.
      }
    }
    this.limpiarSesion();
  }

  private async ejecutarRefresh(refreshTokenPersistido: string): Promise<string> {
    const par = await firstValueFrom(
      this.http.post<TokenPairDto>(`${environment.apiBaseUrl}/auth/refresh`, {
        refresh_token: refreshTokenPersistido,
      }),
    );
    this.aplicarParDeTokens(par);
    return par.access_token;
  }

  private async cargarUsuarioActual(): Promise<void> {
    const usuario = await firstValueFrom(
      this.http.get<UsuarioAutenticadoDto>(`${environment.apiBaseUrl}/auth/me`),
    );
    this.currentUserSignal.set({
      id: usuario.id,
      nombre: usuario.nombre,
      emailInstitucional: usuario.email_institucional,
      rolId: usuario.rol_id,
      ubicacionId: usuario.ubicacion_id,
    });
  }

  private aplicarParDeTokens(par: TokenPairDto): void {
    this.accessTokenSignal.set(par.access_token);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, par.refresh_token);
  }

  private leerRefreshTokenPersistido(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  private limpiarSesion(): void {
    this.accessTokenSignal.set(null);
    this.currentUserSignal.set(null);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}
