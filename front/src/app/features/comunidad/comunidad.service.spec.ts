import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { comunidadQueryKeys } from './comunidad-query-keys';
import { ComunidadService } from './comunidad.service';

const BASE_URL = `${environment.apiBaseUrl}/comunidad`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const personaDto = {
  id: 'p-1',
  numero_documento: '123456789',
  nombre: 'Ana Estudiante',
  tipo_persona_id: 'tp-1',
  id_carnet: 'C-001',
  correo: 'ana@uco.edu.co',
  numero_contacto: '3001234567',
  facultad: 'Ingenieria',
};

describe('ComunidadService', () => {
  let service: ComunidadService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(ComunidadService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta la lista completa (GET /api/comunidad/)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([personaDto]);

    await vi.waitFor(() => expect(service.personas.data()).toEqual([personaDto]));
  });
});

describe('comunidadQueryKeys', () => {
  it('la clave de la lista cuelga del prefijo raiz', () => {
    expect(comunidadQueryKeys.lista.slice(0, comunidadQueryKeys.raiz.length)).toEqual([
      ...comunidadQueryKeys.raiz,
    ]);
  });

  it('el lookup de tipos de persona NO cuelga de la raiz de comunidad', () => {
    expect(comunidadQueryKeys.lookupTiposPersona[0]).not.toBe(comunidadQueryKeys.raiz[0]);
  });
});
