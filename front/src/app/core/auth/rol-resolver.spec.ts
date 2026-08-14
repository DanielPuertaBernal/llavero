import { provideHttpClient } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { resolverNombreRol } from './rol-resolver';

const API = environment.apiBaseUrl;

const rolAdminDto = { id: 'r-admin', nombre: 'Administrador' };
const rolPorteroDto = { id: 'r-portero', nombre: 'Portero' };

describe('resolverNombreRol', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('resuelve el nombre del rol consultando GET /api/catalogos/roles', async () => {
    const resultado = resolverNombreRol(http, 'r-portero');
    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);

    expect(await resultado).toBe('Portero');
  });

  it('devuelve null cuando el rolId no esta en el catalogo', async () => {
    const resultado = resolverNombreRol(http, 'r-inexistente');
    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);

    expect(await resultado).toBeNull();
  });

  it('propaga el error si la consulta de roles falla (el caller decide como fallar)', async () => {
    const resultado = resolverNombreRol(http, 'r-admin');
    const req = httpMock.expectOne(`${API}/catalogos/roles`);
    req.flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });

    await expect(resultado).rejects.toBeTruthy();
  });
});
