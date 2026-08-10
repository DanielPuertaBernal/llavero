import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { PrestamoDetallesService } from './prestamo-detalles.service';
import { prestamosQueryKeys } from './prestamos-query-keys';

const BASE_URL = `${environment.apiBaseUrl}/prestamos`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const detalleDto = {
  id: 'det-1',
  prestamo_id: 'pr-1',
  equipo_id: 'eq-1',
  novedad_id: null,
  estado_equipo: 'entregado',
  fecha_entrega: '2026-08-09T14:30:00Z',
  fecha_devolucion: null,
};

const devolucionDto = {
  id: 'dev-1',
  prestamo_id: 'pr-1',
  usuario_recibe_id: 'us-2',
  ubicacion_id: 'ub-2',
  fecha: '2026-08-09T18:00:00Z',
  es_completa: false,
};

describe('PrestamoDetallesService', () => {
  let service: PrestamoDetallesService;
  let httpMock: HttpTestingController;
  let queryClient: QueryClient;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        // No es `providedIn: 'root'`: se provee explícitamente, igual que lo
        // hacen la fila expandida y el diálogo de devolución.
        PrestamoDetallesService,
      ],
    });
    queryClient = TestBed.inject(QueryClient);
    service = TestBed.inject(PrestamoDetallesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sin prestamoId no dispara ninguna de las dos consultas', async () => {
    expect(service.prestamoId()).toBeNull();
    httpMock.expectNone((request) => request.url.startsWith(BASE_URL));
    expect(service.detalles.data()).toBeUndefined();
    expect(service.devoluciones.data()).toBeUndefined();
  });

  it('al fijar el prestamoId consulta detalles y devoluciones de ese préstamo', async () => {
    service.prestamoId.set('pr-1');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([detalleDto]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([devolucionDto]);

    await vi.waitFor(() => {
      expect(service.detalles.data()).toEqual([detalleDto]);
      expect(service.devoluciones.data()).toEqual([devolucionDto]);
    });
    expect(queryClient.getQueryData(prestamosQueryKeys.detalles('pr-1'))).toEqual([detalleDto]);
    expect(queryClient.getQueryData(prestamosQueryKeys.devoluciones('pr-1'))).toEqual([
      devolucionDto,
    ]);
  });

  it('cambiar el prestamoId consulta el nuevo préstamo bajo su propia clave', async () => {
    service.prestamoId.set('pr-1');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([detalleDto]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([devolucionDto]);
    await vi.waitFor(() => expect(service.detalles.data()).toEqual([detalleDto]));

    service.prestamoId.set('pr-2');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/pr-2/detalles`).flush([]);
    httpMock.expectOne(`${BASE_URL}/pr-2/devoluciones`).flush([]);

    await vi.waitFor(() => expect(service.detalles.data()).toEqual([]));
    // La caché del primer préstamo sigue intacta: son claves distintas.
    expect(queryClient.getQueryData(prestamosQueryKeys.detalles('pr-1'))).toEqual([detalleDto]);
  });

  it('expone solo los equipos que siguen entregados (los devueltos ya no se pueden devolver)', async () => {
    service.prestamoId.set('pr-1');
    await cederMicrotask();

    const devuelto = {
      ...detalleDto,
      id: 'det-2',
      equipo_id: 'eq-2',
      estado_equipo: 'devuelto',
      fecha_devolucion: '2026-08-09T18:00:00Z',
    };
    httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([detalleDto, devuelto]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([]);

    await vi.waitFor(() => expect(service.detalles.data()?.length).toBe(2));
    expect(service.equiposEntregados()).toEqual(['eq-1']);
  });
});
