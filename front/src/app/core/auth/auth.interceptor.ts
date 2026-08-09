import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

// Endpoints de auth que nunca deben llevar el bearer token propio: `/login`
// es un redirect anónimo, y `/exchange`/`/refresh` son justamente las
// llamadas que *producen* el token (adjuntar uno viejo/ausente no aplica).
const RUTAS_SIN_BEARER = [
  `${environment.apiBaseUrl}/auth/login`,
  `${environment.apiBaseUrl}/auth/exchange`,
  `${environment.apiBaseUrl}/auth/refresh`,
];

/**
 * Interceptor HTTP funcional (estilo actual de Angular, ver `provideHttpClient`
 * en app.config.ts):
 *
 * 1. Adjunta el access token vigente (`AuthService.accessToken()`) como
 *    `Authorization: Bearer <token>` a toda request que no sea una de las
 *    rutas de auth exentas arriba.
 * 2. Ante un 401, dispara `AuthService.refresh()` y reintenta la request
 *    original una sola vez con el token nuevo. La deduplicación de refresh
 *    concurrente (N requests en 401 al mismo tiempo -> un solo refresh)
 *    vive en `AuthService.refresh()`, no acá: este interceptor solo llama
 *    a `refresh()` tantas veces como haga falta, confiando en que
 *    `AuthService` colapsa esas llamadas en una sola promesa compartida.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  const requiereBearer = !RUTAS_SIN_BEARER.some((ruta) => req.url.startsWith(ruta));
  const accessToken = authService.accessToken();
  const requestConToken =
    requiereBearer && accessToken
      ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
      : req;

  return next(requestConToken).pipe(
    catchError((error: unknown) => {
      const esNoAutenticado = error instanceof HttpErrorResponse && error.status === 401;
      if (!esNoAutenticado || !requiereBearer) {
        return throwError(() => error);
      }

      return from(authService.refresh()).pipe(
        switchMap((nuevoAccessToken) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${nuevoAccessToken}` } })),
        ),
        catchError((errorDeRefresh: unknown) => throwError(() => errorDeRefresh)),
      );
    }),
  );
};
