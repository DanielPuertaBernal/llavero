import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from './auth.service';

type EstadoCallback = 'canjeando' | 'error';

/**
 * Ruta de aterrizaje post-login (debe coincidir con el path configurado en
 * `FRONTEND_POST_LOGIN_REDIRECT_URL` del backend, ver back/config/settings.py
 * y back/auth/controller.py `callback`). El backend nunca redirige acá con
 * los JWT reales — solo con `?code=<opaco>` (éxito) o `?error=...` (fallo);
 * esta pantalla lee ese código y lo canjea vía `AuthService.exchange()`
 * (`POST /api/auth/exchange`) para recién ahí obtener el par de JWT.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    @if (estado() === 'canjeando') {
      <p>Iniciando sesión…</p>
    } @else {
      <p>No fue posible iniciar sesión. Intenta de nuevo.</p>
    }
  `,
})
export class AuthCallbackComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly estado = signal<EstadoCallback>('canjeando');

  constructor() {
    void this.procesarCallback();
  }

  private async procesarCallback(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    // El backend redirige con `?code=<opaco>` (query param en inglés, ver
    // back/auth/controller.py `callback`: `urlencode({'code': codigo})`),
    // aunque el body de `POST /exchange` espera el campo `codigo` (español,
    // ver `CodigoLoginIn`). No son el mismo nombre — no unificar por error.
    const codigo = params.get('code');
    const error = params.get('error');

    if (error || !codigo) {
      this.estado.set('error');
      return;
    }

    try {
      await this.authService.exchange(codigo);
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.estado.set('error');
    }
  }
}
