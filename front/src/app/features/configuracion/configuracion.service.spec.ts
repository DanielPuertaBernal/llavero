import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ConfiguracionService } from './configuracion.service';
import type { Configuracion, ConfiguracionInput } from './configuracion.models';

const BASE_URL = `${environment.apiBaseUrl}/configuracion`;

// `injectQuery`/`injectMutation` disparan su lado HTTP un tick después de
// crear el servicio o de llamar a `.mutate(...)`, no en el mismo tick
// síncrono — mismo patrón que el resto de specs de servicios de este
// proyecto.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const configuracionDto: Configuracion = {
  id: 'cf-1',
  limite_antes_mora_minutos: 120,
  max_reintentos_recordatorio: 3,
  plantilla_recordatorio: null,
  ubicacion_defecto_id: 'ub-1',
  limite_no_reclamada_minutos: 30,
};

describe('ConfiguracionService', () => {
  let service: ConfiguracionService;
  let httpMock: HttpTestingController;
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTanStackQuery(queryClient)],
    });
    service = TestBed.inject(ConfiguracionService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta la configuración global con GET /api/configuracion/', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush(configuracionDto);

    await vi.waitFor(() => expect(service.configuracion.data()).toEqual(configuracionDto));
  });

  it('actualizar hace PUT con los 5 campos de ConfiguracionInput y refresca la consulta', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush(configuracionDto);
    await vi.waitFor(() => expect(service.configuracion.data()).toEqual(configuracionDto));

    const input: ConfiguracionInput = {
      ubicacion_defecto_id: 'ub-2',
      limite_antes_mora_minutos: 90,
      max_reintentos_recordatorio: 5,
      plantilla_recordatorio: 'Recuerda entregar la llave a tiempo.',
      limite_no_reclamada_minutos: 45,
    };
    const actualizado: Configuracion = { id: 'cf-1', ...input };

    service.actualizar.mutate(input);
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'PUT', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual(input);
    req.flush(actualizado);

    await vi.waitFor(() => expect(service.actualizar.isSuccess()).toBe(true));

    // La mutación invalida la raíz: el GET vuelve a dispararse.
    httpMock.expectOne(`${BASE_URL}/`).flush(actualizado);
  });
});
