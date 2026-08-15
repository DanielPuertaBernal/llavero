import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Guard funcional (estilo actual de Angular) para rutas que requieren
 * sesión iniciada. Solo protege la navegación en el cliente — es UX, no
 * seguridad: la validación real de autenticación/autorización vive en el
 * backend, en cada endpoint (ver deuda técnica documentada en
 * `AulaSync/analisis/estrategia-migracion/frontend.md`, "Autorización de
 * rol ADMIN validada solo en cliente" — no repetir ese error acá).
 *
 * Sin sesión, redirige a la pantalla propia `/login` (`LoginComponent`,
 * ver login-institucional) devolviendo un `UrlTree` en vez de llamar a
 * `AuthService.login()` directamente y devolver `false`: eso mandaría al
 * navegador derecho a Microsoft sin mostrar nunca el formulario branded,
 * y un `UrlTree` es el primitivo de redirect ya establecido en este
 * proyecto (ver `rol.guard.ts`, `router.createUrlTree`).
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

/**
 * Guard inverso al anterior: protege `/login` de un visitante que ya
 * tiene sesión iniciada — no tiene sentido mostrarle el formulario de
 * nuevo, se lo redirige a `/dashboard` (mismo destino que usa
 * `rol.guard.ts` cuando falla cerrado).
 */
export const invitadoGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
