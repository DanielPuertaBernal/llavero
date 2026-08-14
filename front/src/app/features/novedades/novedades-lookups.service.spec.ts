import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { NovedadesLookupsService } from './novedades-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioDto = {
  id: 'us-1',
  nombre: 'Ana Vigilante',
  email_institucional: 'ana@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};

const otroUsuarioDto = { ...usuarioDto, id: 'us-2', nombre: 'Bruno Portería' };

function responderLookup(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto, otroUsuarioDto]);
}

describe('NovedadesLookupsService', () => {
  let service: NovedadesLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(NovedadesLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta usuarios en GET /api/usuarios/, el mismo lookup que usuarios', async () => {
    responderLookup(httpMock);

    await vi.waitFor(() => {
      expect(service.usuarios.data()).toEqual([usuarioDto, otroUsuarioDto]);
    });
  });

  it('resuelve el nombre de quien registró, y cae al id crudo si el lookup aún no cargó', async () => {
    expect(service.nombreUsuario('us-1')).toBe('us-1');

    responderLookup(httpMock);

    await vi.waitFor(() => {
      expect(service.nombreUsuario('us-1')).toBe('Ana Vigilante');
    });
    expect(service.nombreUsuario('us-desconocido')).toBe('us-desconocido');
  });

  it('no ofrece mutaciones: usuarios es de solo lectura para esta feature', () => {
    expect((service as unknown as Record<string, unknown>)['crear']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['actualizar']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['eliminar']).toBeUndefined();

    responderLookup(httpMock);
  });
});
