import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { DisponibilidadLookupsService } from './disponibilidad-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const salonDto = {
  id: 'sa-1',
  nombre: 'Aula 201',
  bloque_id: 'bl-1',
  tipo_silleteria_id: 'ts-1',
  cantidad_sillas: 30,
  cantidad_mesas: 15,
};

describe('DisponibilidadLookupsService', () => {
  let service: DisponibilidadLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(DisponibilidadLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta el catálogo de salones', async () => {
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    await vi.waitFor(() => expect(service.salones.data()?.length).toBe(1));
  });

  it('expone opciones ya formateadas para el selector (label/value)', async () => {
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    await vi.waitFor(() =>
      expect(service.opcionesSalones()).toEqual([{ label: 'Aula 201', value: 'sa-1' }]),
    );
  });

  it('resuelve el id de salón a nombre legible', async () => {
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    await vi.waitFor(() => expect(service.nombreSalon('sa-1')).toBe('Aula 201'));
  });

  it('devuelve el id crudo mientras el lookup no haya cargado o si el id no está en la lista', () => {
    expect(service.nombreSalon('sa-9')).toBe('sa-9');
    expect(service.listaSalones()).toEqual([]);

    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
  });
});
