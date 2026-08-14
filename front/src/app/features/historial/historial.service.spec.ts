import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { AuthService } from '../../core/auth/auth.service';
import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { environment } from '../../../environments/environment';
import { historialQueryKeys } from './historial-query-keys';
import { HistorialService } from './historial.service';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/historial`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const rolAdminDto = { id: 'r-admin', nombre: 'Administrador' };
const rolPorteroDto = { id: 'r-portero', nombre: 'Portero' };

const usuarioAdmin: UsuarioAutenticado = {
  id: 'us-admin-1',
  nombre: 'Ana Admin',
  emailInstitucional: 'ana@uco.edu.co',
  rolId: 'r-admin',
  ubicacionId: 'ub-1',
};

const usuarioPortero: UsuarioAutenticado = {
  id: 'us-portero-1',
  nombre: 'Pedro Portero',
  emailInstitucional: 'pedro@uco.edu.co',
  rolId: 'r-portero',
  ubicacionId: 'ub-1',
};

const eventoDto = {
  tipo_recurso: 'llave',
  tipo_evento: 'entrega',
  procesado_por_id: 'us-1',
  fecha_hora: '2026-08-13T14:00:00-05:00',
  llave_id: 'll-1',
  salon_id: 'sa-1',
  docente_titular_id: 'p-1',
  reclamado_por_id: 'p-2',
  prestamo_id: null,
  solicitante_id: null,
  equipo_ids: null,
};

function configurarTestBed(usuario: UsuarioAutenticado | null): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      { provide: AuthService, useValue: { currentUser: () => usuario } },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('HistorialService', () => {
  afterEach(() => {
    // cada test hace su propio httpMock.verify()
  });

  it('Administrador: consulta la lista SIN filtro por usuario_id', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(HistorialService);
    await cederMicrotask();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      const req = httpMock.expectOne(`${BASE_URL}/`);
      req.flush([eventoDto]);
    });

    await vi.waitFor(() => expect(service.eventos.data()).toEqual([eventoDto]));
    expect(service.esPortero()).toBe(false);
    httpMock.verify();
  });

  it('Portero: consulta la lista CON usuario_id = su propio id', async () => {
    const httpMock = configurarTestBed(usuarioPortero);
    const service = TestBed.inject(HistorialService);
    await cederMicrotask();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      const req = httpMock.expectOne(`${BASE_URL}/?usuario_id=us-portero-1`);
      req.flush([eventoDto]);
    });

    await vi.waitFor(() => expect(service.eventos.data()).toEqual([eventoDto]));
    expect(service.esPortero()).toBe(true);
    httpMock.verify();
  });

  it('falla-seguro: si la resolucion de rol falla, filtra por el usuario actual (no expone todo)', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(HistorialService);
    await cederMicrotask();

    const reqRoles = httpMock.expectOne(`${API}/catalogos/roles`);
    reqRoles.flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });

    await vi.waitFor(() => {
      const req = httpMock.expectOne(`${BASE_URL}/?usuario_id=us-admin-1`);
      req.flush([eventoDto]);
    });

    await vi.waitFor(() => expect(service.eventos.data()).toEqual([eventoDto]));
    expect(service.esPortero()).toBe(true);
    httpMock.verify();
  });

  it('sin sesion: no dispara ninguna consulta', async () => {
    const httpMock = configurarTestBed(null);
    TestBed.inject(HistorialService);
    await cederMicrotask();

    httpMock.verify();
  });
});

describe('historialQueryKeys', () => {
  it('la clave de lista cuelga del prefijo raiz', () => {
    expect(historialQueryKeys.lista(null).slice(0, historialQueryKeys.raiz.length)).toEqual([
      ...historialQueryKeys.raiz,
    ]);
  });

  it('la clave de lista distingue entre sin filtro y con filtro por usuario', () => {
    expect(historialQueryKeys.lista(null)).not.toEqual(historialQueryKeys.lista('us-1'));
  });

  it('rolActual y los lookups NO cuelgan de la raiz de historial', () => {
    expect(historialQueryKeys.rolActual(null)[0]).not.toBe(historialQueryKeys.raiz[0]);
    expect(historialQueryKeys.lookupUsuarios[0]).not.toBe(historialQueryKeys.raiz[0]);
  });
});
