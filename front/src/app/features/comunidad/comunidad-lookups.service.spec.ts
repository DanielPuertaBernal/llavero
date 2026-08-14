import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ComunidadLookupsService } from './comunidad-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const tipoPersonaDto = {
  id: 'tp-1',
  nombre: 'Estudiante',
};

describe('ComunidadLookupsService', () => {
  let service: ComunidadLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(ComunidadLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta GET /api/catalogos/tipos-persona', async () => {
    httpMock.expectOne(`${API}/catalogos/tipos-persona`).flush([tipoPersonaDto]);

    await vi.waitFor(() => expect(service.listaTiposPersona()).toEqual([tipoPersonaDto]));
  });

  it('resuelve nombreTipoPersona por id', async () => {
    httpMock.expectOne(`${API}/catalogos/tipos-persona`).flush([tipoPersonaDto]);

    await vi.waitFor(() => expect(service.nombreTipoPersona('tp-1')).toBe('Estudiante'));
  });

  it('cae al id crudo cuando el tipo de persona no esta en el lookup', async () => {
    httpMock.expectOne(`${API}/catalogos/tipos-persona`).flush([tipoPersonaDto]);

    await vi.waitFor(() => expect(service.nombreTipoPersona('tp-inexistente')).toBe('tp-inexistente'));
  });
});
