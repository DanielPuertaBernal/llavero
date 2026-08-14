import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { HistorialLookupsService } from './historial-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioDto = { id: 'us-1', nombre: 'Ana Portera' };
const personaDto = { id: 'p-1', nombre: 'Bruno Docente' };
const salonDto = { id: 'sa-1', nombre: 'Salón 101' };
const equipoDto = { id: 'eq-1', nombre: 'Videobeam Epson' };

describe('HistorialLookupsService', () => {
  let service: HistorialLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(HistorialLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushTodos(): void {
    httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
    httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
    httpMock.expectOne(`${API}/equipos/`).flush([equipoDto]);
  }

  it('consulta los cuatro catalogos de apoyo (usuarios, comunidad, salones, equipos)', async () => {
    flushTodos();

    await vi.waitFor(() => {
      expect(service.listaUsuarios()).toEqual([usuarioDto]);
      expect(service.listaPersonas()).toEqual([personaDto]);
      expect(service.listaSalones()).toEqual([salonDto]);
      expect(service.listaEquipos()).toEqual([equipoDto]);
    });
  });

  it('resuelve nombreUsuario por id', async () => {
    flushTodos();

    await vi.waitFor(() => expect(service.nombreUsuario('us-1')).toBe('Ana Portera'));
  });

  it('cae al id crudo cuando el usuario no esta en el lookup', async () => {
    flushTodos();

    await vi.waitFor(() => expect(service.nombreUsuario('us-inexistente')).toBe('us-inexistente'));
  });

  it('resuelve nombrePersona por id', async () => {
    flushTodos();

    await vi.waitFor(() => expect(service.nombrePersona('p-1')).toBe('Bruno Docente'));
  });

  it('resuelve nombreSalon por id', async () => {
    flushTodos();

    await vi.waitFor(() => expect(service.nombreSalon('sa-1')).toBe('Salón 101'));
  });

  it('resuelve nombresEquipos para una lista de ids, uniendo los nombres', async () => {
    flushTodos();

    await vi.waitFor(() =>
      expect(service.nombresEquipos(['eq-1', 'eq-inexistente'])).toBe(
        'Videobeam Epson, eq-inexistente',
      ),
    );
  });

  it('nombresEquipos devuelve null cuando la lista de ids es null', async () => {
    flushTodos();
    await cederMicrotask();

    expect(service.nombresEquipos(null)).toBeNull();
  });
});
