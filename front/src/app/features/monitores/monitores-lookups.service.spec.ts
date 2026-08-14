import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { MonitoresLookupsService } from './monitores-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const docenteDto = {
  id: 'p-1',
  numero_documento: '1001',
  nombre: 'Ana Docente',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: null,
  numero_contacto: null,
  facultad: null,
};

const monitorDelegadoDto = {
  id: 'p-2',
  numero_documento: '2002',
  nombre: 'Bruno Estudiante',
  tipo_persona_id: 'tp-2',
  id_carnet: 'c-2',
  correo: 'bruno@uco.edu.co',
  numero_contacto: null,
  facultad: 'Ingeniería',
};

/** Único lookup que el servicio dispara al inyectarse. */
function responderLookup(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/comunidad/`).flush([docenteDto, monitorDelegadoDto]);
}

describe('MonitoresLookupsService', () => {
  let service: MonitoresLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(MonitoresLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta el lookup de personas en el endpoint de comunidad, su módulo dueño', async () => {
    responderLookup(httpMock);

    await vi.waitFor(() => {
      expect(service.personas.data()).toEqual([docenteDto, monitorDelegadoDto]);
    });
  });

  it('resuelve el nombre de una persona y cae al id crudo si el lookup aún no cargó', async () => {
    expect(service.nombrePersona('p-1')).toBe('p-1');

    responderLookup(httpMock);

    await vi.waitFor(() => {
      expect(service.nombrePersona('p-1')).toBe('Ana Docente');
      expect(service.nombrePersona('p-2')).toBe('Bruno Estudiante');
    });
    expect(service.nombrePersona('p-desconocido')).toBe('p-desconocido');
  });

  it('arma UNA sola lista de opciones, reusable tanto para docente titular como para monitor delegado', async () => {
    responderLookup(httpMock);

    await vi.waitFor(() => expect(service.opcionesPersonas().length).toBe(2));
    expect(service.opcionesPersonas()).toEqual([
      { label: 'Ana Docente (1001)', value: 'p-1' },
      { label: 'Bruno Estudiante (2002)', value: 'p-2' },
    ]);
  });

  it('no ofrece mutaciones: comunidad es de solo lectura para esta feature', () => {
    expect((service as unknown as Record<string, unknown>)['crear']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['actualizar']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['eliminar']).toBeUndefined();

    responderLookup(httpMock);
  });
});
