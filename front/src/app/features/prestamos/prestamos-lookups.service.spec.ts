import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { PrestamosLookupsService } from './prestamos-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const ubicacionDto = {
  id: 'ub-1',
  nombre: 'Almacén',
  permite_prestamo_llaves: false,
  permite_devolucion_llaves: false,
  permite_prestamo_equipos: true,
};
const ubicacionSinPrestamoDto = {
  id: 'ub-2',
  nombre: 'Archivo',
  permite_prestamo_llaves: false,
  permite_devolucion_llaves: false,
  permite_prestamo_equipos: false,
};
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
const usuarioDto = {
  id: 'us-1',
  nombre: 'Auxiliar Uno',
  email_institucional: 'aux1@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};
const equipoDto = {
  id: 'eq-1',
  nombre: 'Videobeam',
  marca: 'Epson',
  codigo_inventario: 'INV-001',
  codigo_barras: null,
  estado: 'activo',
};
const equipoInactivoDto = { ...equipoDto, id: 'eq-2', nombre: 'Portátil', estado: 'inactivo' };
const novedadDto = {
  id: 'n-1',
  categoria: 'equipo',
  descripcion: 'Carcasa rota',
  estado: 'abierta',
  solucion: null,
  registrado_por_id: 'us-1',
};

/** Responde las 5 consultas de lookup que el servicio dispara al inyectarse. */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionSinPrestamoDto, ubicacionDto]);
  httpMock.expectOne(`${API}/equipos/`).flush([equipoDto, equipoInactivoDto]);
  httpMock.expectOne(`${API}/novedades/`).flush([novedadDto]);
}

describe('PrestamosLookupsService', () => {
  let service: PrestamosLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(PrestamosLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta los 5 catálogos de apoyo en los endpoints de sus módulos dueños', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => {
      expect(service.personas.data()).toEqual([personaDto]);
      expect(service.usuarios.data()).toEqual([usuarioDto]);
      expect(service.equipos.data()).toEqual([equipoDto, equipoInactivoDto]);
      expect(service.novedades.data()).toEqual([novedadDto]);
    });
  });

  it('resuelve el nombre de cada FK y cae al id crudo si el lookup aún no cargó', async () => {
    expect(service.nombrePersona('p-1')).toBe('p-1');
    expect(service.nombreUsuario('us-1')).toBe('us-1');
    expect(service.nombreUbicacion('ub-1')).toBe('ub-1');
    expect(service.nombreEquipo('eq-1')).toBe('eq-1');
    expect(service.nombreNovedad('n-1')).toBe('n-1');

    responderLookups(httpMock);

    await vi.waitFor(() => {
      expect(service.nombrePersona('p-1')).toBe('Ana Docente');
      expect(service.nombreUsuario('us-1')).toBe('Auxiliar Uno');
      expect(service.nombreUbicacion('ub-1')).toBe('Almacén');
      expect(service.nombreEquipo('eq-1')).toBe('Videobeam (INV-001)');
      expect(service.nombreNovedad('n-1')).toBe('equipo — Carcasa rota');
    });
    // Un id desconocido tampoco rompe: se muestra tal cual.
    expect(service.nombreEquipo('eq-desconocido')).toBe('eq-desconocido');
  });

  it('etiqueta cada equipo con su nombre y su código de inventario, marcando los inactivos', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => expect(service.opcionesEquipos().length).toBe(2));
    // El código de inventario desambigua equipos del mismo modelo; el estado
    // solo se ETIQUETA (nunca se filtra: la disponibilidad real la decide el
    // backend al crear el préstamo, ver prestamos-error.util.ts).
    expect(service.opcionesEquipos()).toEqual([
      { label: 'Videobeam (INV-001)', value: 'eq-1' },
      { label: 'Portátil (INV-001) — inactivo', value: 'eq-2' },
    ]);
  });

  it('arma las opciones de personas, usuarios y novedades', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => expect(service.opcionesPersonas().length).toBe(1));
    expect(service.opcionesPersonas()).toEqual([{ label: 'Ana Docente (1001)', value: 'p-1' }]);
    expect(service.opcionesUsuarios()).toEqual([{ label: 'Auxiliar Uno', value: 'us-1' }]);
    expect(service.opcionesNovedades()).toEqual([{ label: 'equipo — Carcasa rota', value: 'n-1' }]);
  });

  it('ordena las ubicaciones de préstamo poniendo primero las que lo permiten (sin excluir ninguna)', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => expect(service.ubicacionesPrestamo().length).toBe(2));
    // La que permite préstamo de equipos queda primero aunque el backend la
    // devolvió segunda; la que no lo permite SIGUE en la lista.
    expect(service.ubicacionesPrestamo().map((ubicacion) => ubicacion.id)).toEqual([
      'ub-1',
      'ub-2',
    ]);
    // La devolución NO tiene permiso propio en el backend (no existe
    // `permite_devolucion_equipos`): se ofrecen todas, en el orden recibido.
    expect(service.ubicacionesDevolucion().map((ubicacion) => ubicacion.id)).toEqual([
      'ub-2',
      'ub-1',
    ]);
  });
});
