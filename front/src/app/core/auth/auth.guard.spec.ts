import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { authGuard, invitadoGuard } from './auth.guard';

function configurarTestBed(autenticado: boolean): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { isAuthenticated: () => autenticado } },
    ],
  });
}

describe('authGuard', () => {
  it('permite la navegacion cuando hay sesion activa', () => {
    configurarTestBed(true);

    const resultado = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

    expect(resultado).toBe(true);
  });

  it('redirige a /login (UrlTree) cuando no hay sesion activa', () => {
    configurarTestBed(false);
    const router = TestBed.inject(Router);

    const resultado = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

    expect(resultado).toEqual(router.createUrlTree(['/login']));
  });
});

describe('invitadoGuard', () => {
  it('permite la navegacion cuando NO hay sesion activa', () => {
    configurarTestBed(false);

    const resultado = TestBed.runInInjectionContext(() => invitadoGuard({} as never, {} as never));

    expect(resultado).toBe(true);
  });

  it('redirige a /dashboard (UrlTree) cuando ya hay sesion activa', () => {
    configurarTestBed(true);
    const router = TestBed.inject(Router);

    const resultado = TestBed.runInInjectionContext(() => invitadoGuard({} as never, {} as never));

    expect(resultado).toEqual(router.createUrlTree(['/dashboard']));
  });
});
