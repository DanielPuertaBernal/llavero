import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { UsuariosLookupsService } from './usuarios-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const rolDto = { id: 'r-1', nombre: 'Administrador' };
const otroRolDto = { id: 'r-2', nombre: 'Vigilante' };
// El backend devuelve `UbicacionOut` completo; esta feature solo declara y
// usa `id`/`nombre` (ver usuarios.models.ts), pero el DTO de prueba llega
// tal cual viaja por HTTP.
const ubicacionDto = {
  id: 'ub-1',
  nombre: 'Portería',
  permite_prestamo_llaves: true,
  permite_devolucion_llaves: true,
  permite_prestamo_equipos: false,
};

/** Responde los 2 lookups que el servicio dispara al inyectarse. */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/catalogos/roles`).flush([rolDto, otroRolDto]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);
}

describe('UsuariosLookupsService', () => {
  let service: UsuariosLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(UsuariosLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta roles y ubicaciones en los endpoints de catalogos, su módulo dueño', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => {
      expect(service.roles.data()).toEqual([rolDto, otroRolDto]);
      expect(service.ubicaciones.data()).toEqual([ubicacionDto]);
    });
  });

  it('resuelve el nombre de rol y ubicación, y cae al id crudo si el lookup aún no cargó', async () => {
    // Antes de responder: los lookups están vacíos, así que se muestra el id.
    expect(service.nombreRol('r-1')).toBe('r-1');
    expect(service.nombreUbicacion('ub-1')).toBe('ub-1');

    responderLookups(httpMock);

    await vi.waitFor(() => {
      expect(service.nombreRol('r-1')).toBe('Administrador');
      expect(service.nombreUbicacion('ub-1')).toBe('Portería');
    });
    // Un id desconocido tampoco rompe: se muestra tal cual.
    expect(service.nombreRol('r-desconocido')).toBe('r-desconocido');
    expect(service.nombreUbicacion('ub-desconocida')).toBe('ub-desconocida');
  });

  it('arma las opciones de los dos p-select del formulario', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => expect(service.opcionesRoles().length).toBe(2));
    expect(service.opcionesRoles()).toEqual([
      { label: 'Administrador', value: 'r-1' },
      { label: 'Vigilante', value: 'r-2' },
    ]);
    expect(service.opcionesUbicaciones()).toEqual([{ label: 'Portería', value: 'ub-1' }]);
  });

  it('no ofrece mutaciones: los catálogos son de solo lectura para esta feature', () => {
    expect((service as unknown as Record<string, unknown>)['crear']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['actualizar']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['eliminar']).toBeUndefined();

    responderLookups(httpMock);
  });
});
