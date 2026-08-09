import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Guard funcional (estilo actual de Angular) para rutas que requieren
 * sesión iniciada. Solo protege la navegación en el cliente — es UX, no
 * seguridad: la validación real de autenticación/autorización vive en el
 * backend, en cada endpoint (ver deuda técnica documentada en
 * `AulaSync/analisis/estrategia-migracion/frontend.md`, "Autorización de
 * rol ADMIN validada solo en cliente" — no repetir ese error acá).
 *
 * No hay una "página de login" propia a la que redirigir: sin sesión, la
 * única acción posible es mandar al usuario al login federado del backend
 * (`AuthService.login()`, que redirige fuera de Angular). Se cancela la
 * navegación (`return false`) en vez de devolver un `UrlTree` porque el
 * navegador ya está saliendo de la SPA.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);

  if (authService.isAuthenticated()) {
    return true;
  }

  authService.login();
  return false;
};
