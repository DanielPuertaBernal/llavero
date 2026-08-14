import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import type { UsuarioAutenticado } from './auth.models';
import { AuthService } from './auth.service';
import { crearGuardaDeRol } from './rol.guard';

const API = environment.apiBaseUrl;

const usuarioAutenticado: UsuarioAutenticado = {
  id: 'us-1',
  nombre: 'Ana Admin',
  emailInstitucional: 'ana@uco.edu.co',
  rolId: 'r-admin',
  ubicacionId: 'ub-1',
};

const rolAdminDto = {
  id: 'r-admin',
  nombre: 'Administrador',
};

const rolPorteroDto = {
  id: 'r-portero',
  nombre: 'Portero',
};

function configurarTestBed(usuario: UsuarioAutenticado | null): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: () => usuario } },
    ],
  });
}

describe('crearGuardaDeRol', () => {
  it('permite la navegacion cuando el rol resuelto esta en la lista permitida', async () => {
    configurarTestBed(usuarioAutenticado);
    const httpMock = TestBed.inject(HttpTestingController);
    const guard = crearGuardaDeRol(['Administrador', 'Auxiliar']);

    const resultado = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);

    expect(await resultado).toBe(true);
  });

  it('redirige a /dashboard cuando el rol resuelto NO esta permitido (ej. Portero)', async () => {
    const usuarioPortero: UsuarioAutenticado = {
      ...usuarioAutenticado,
      rolId: 'r-portero',
    };
    configurarTestBed(usuarioPortero);
    const httpMock = TestBed.inject(HttpTestingController);
    const guard = crearGuardaDeRol(['Administrador', 'Auxiliar']);

    const resultado = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);

    expect(await resultado).not.toBe(true);
  });

  it('redirige a /dashboard cuando no hay sesion activa', async () => {
    configurarTestBed(null);
    TestBed.inject(HttpTestingController);
    const guard = crearGuardaDeRol(['Administrador', 'Auxiliar']);

    const resultado = TestBed.runInInjectionContext(() => guard({} as never, {} as never));

    expect(await resultado).not.toBe(true);
  });

  it('falla cerrado (redirige) si la consulta de roles falla', async () => {
    configurarTestBed(usuarioAutenticado);
    const httpMock = TestBed.inject(HttpTestingController);
    const guard = crearGuardaDeRol(['Administrador', 'Auxiliar']);

    const resultado = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    const req = httpMock.expectOne(`${API}/catalogos/roles`);
    const opcionesError = {
      status: 500,
      statusText: 'Server Error',
    };
    req.flush({ detail: 'error' }, opcionesError);

    expect(await resultado).not.toBe(true);
  });
});
