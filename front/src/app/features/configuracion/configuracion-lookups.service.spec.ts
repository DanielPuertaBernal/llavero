import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ConfiguracionLookupsService } from './configuracion-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const ubicacionDto = {
  id: 'ub-1',
  nombre: 'Bodega principal',
  permite_prestamo_llaves: true,
  permite_devolucion_llaves: true,
  permite_prestamo_equipos: true,
};

describe('ConfiguracionLookupsService', () => {
  let service: ConfiguracionLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(ConfiguracionLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta el catálogo de ubicaciones', async () => {
    httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);

    await vi.waitFor(() => expect(service.ubicaciones.data()?.length).toBe(1));
  });

  it('expone opciones ya formateadas para el selector (label/value)', async () => {
    httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);

    await vi.waitFor(() =>
      expect(service.opcionesUbicaciones()).toEqual([{ label: 'Bodega principal', value: 'ub-1' }]),
    );
  });

  it('resuelve el id de ubicación a nombre legible', async () => {
    httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);

    await vi.waitFor(() => expect(service.nombreUbicacion('ub-1')).toBe('Bodega principal'));
  });

  it('devuelve el id crudo mientras el lookup no haya cargado o si el id no está en la lista', () => {
    expect(service.nombreUbicacion('ub-9')).toBe('ub-9');

    httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);
  });
});
