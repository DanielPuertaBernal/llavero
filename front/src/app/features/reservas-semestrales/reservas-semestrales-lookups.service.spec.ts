import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ReservasSemestralesLookupsService } from './reservas-semestrales-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const personaDto = {
  id: 'p-1',
  numero_documento: '1001',
  nombre: 'Ana Docente',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: null,
  numero_contacto: null,
  facultad: null,
};

const salonDto = {
  id: 'sa-1',
  nombre: 'Aula 201',
  bloque_id: 'bl-1',
  tipo_silleteria_id: 'ts-1',
  cantidad_sillas: 30,
  cantidad_mesas: 15,
};

const semestreDto = {
  id: 'sem-1',
  codigo: '2026-2',
  fecha_inicio: '2026-08-03',
  fecha_fin: '2026-12-05',
};

describe('ReservasSemestralesLookupsService', () => {
  let service: ReservasSemestralesLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(ReservasSemestralesLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta los tres catálogos de apoyo de la feature (comunidad, salones y semestres)', async () => {
    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
    httpMock.expectOne(`${API}/programacion/semestres`).flush([semestreDto]);

    await vi.waitFor(() => {
      expect(service.personas.data()?.length).toBe(1);
      expect(service.salones.data()?.length).toBe(1);
      expect(service.semestres.data()?.length).toBe(1);
    });
  });

  it('etiqueta a la persona con su documento para desambiguar homónimos', async () => {
    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
    httpMock.expectOne(`${API}/catalogos/salones`).flush([]);
    httpMock.expectOne(`${API}/programacion/semestres`).flush([]);

    await vi.waitFor(() =>
      expect(service.opcionesPersonas()).toEqual([{ label: 'Ana Docente (1001)', value: 'p-1' }]),
    );
  });

  it('etiqueta al semestre con su código y su rango de fechas', async () => {
    httpMock.expectOne(`${API}/comunidad/`).flush([]);
    httpMock.expectOne(`${API}/catalogos/salones`).flush([]);
    httpMock.expectOne(`${API}/programacion/semestres`).flush([semestreDto]);

    await vi.waitFor(() =>
      expect(service.opcionesSemestres()).toEqual([
        { label: '2026-2 (2026-08-03 - 2026-12-05)', value: 'sem-1' },
      ]),
    );
  });

  it('resuelve los ids a nombre/código legible', async () => {
    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
    httpMock.expectOne(`${API}/programacion/semestres`).flush([semestreDto]);

    await vi.waitFor(() => expect(service.nombrePersona('p-1')).toBe('Ana Docente'));
    expect(service.nombreSalon('sa-1')).toBe('Aula 201');
    expect(service.codigoSemestre('sem-1')).toBe('2026-2');
  });

  it('devuelve el id crudo mientras el lookup no haya cargado o si el id no está en la lista', () => {
    // Todavía sin respuesta: la tabla debe mostrar algo, nunca "undefined".
    expect(service.nombrePersona('p-9')).toBe('p-9');
    expect(service.nombreSalon('sa-9')).toBe('sa-9');
    expect(service.codigoSemestre('sem-9')).toBe('sem-9');
    expect(service.listaSalones()).toEqual([]);

    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
    httpMock.expectOne(`${API}/programacion/semestres`).flush([semestreDto]);
  });
});
