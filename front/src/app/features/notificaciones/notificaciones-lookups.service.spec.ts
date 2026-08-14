import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { NotificacionesLookupsService } from './notificaciones-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const personaDto = {
  id: 'p-1',
  numero_documento: '1001',
  nombre: 'Ana Docente',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: 'ana@uco.edu.co',
  numero_contacto: null,
  facultad: null,
};

describe('NotificacionesLookupsService', () => {
  let service: NotificacionesLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(NotificacionesLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta el catálogo de comunidad (destinatarios posibles)', async () => {
    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);

    await vi.waitFor(() => expect(service.personas.data()?.length).toBe(1));
  });

  it('etiqueta a la persona con su documento para desambiguar homónimos', async () => {
    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);

    await vi.waitFor(() =>
      expect(service.opcionesPersonas()).toEqual([{ label: 'Ana Docente (1001)', value: 'p-1' }]),
    );
  });

  it('resuelve un id a nombre legible', async () => {
    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);

    await vi.waitFor(() => expect(service.nombrePersona('p-1')).toBe('Ana Docente'));
  });

  it('devuelve el id crudo mientras el lookup no haya cargado o si el id no está en la lista', () => {
    // Todavía sin respuesta: la tabla debe mostrar algo, nunca "undefined".
    expect(service.nombrePersona('p-9')).toBe('p-9');

    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  });
});
