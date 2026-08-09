import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { LlavesLookupsService } from './llaves-lookups.service';

const API = environment.apiBaseUrl;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const salonDto = { id: 's-1', nombre: 'Aula 101' };
const ubicacionDto = {
  id: 'ub-1',
  nombre: 'Portería',
  permite_prestamo_llaves: true,
  permite_devolucion_llaves: true,
  permite_prestamo_equipos: false,
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
  nombre: 'Vigilante Uno',
  email_institucional: 'vig1@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};
const novedadDto = {
  id: 'n-1',
  categoria: 'llave',
  descripcion: 'Llave rayada',
  estado: 'abierta',
  solucion: null,
  registrado_por_id: 'us-1',
};

/**
 * Responde las 5 consultas de lookup que el servicio dispara al inyectarse.
 * El orden no importa: `expectOne` empareja por URL.
 */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionSinPrestamoDto, ubicacionDto]);
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
  httpMock.expectOne(`${API}/novedades/`).flush([novedadDto]);
}

describe('LlavesLookupsService', () => {
  let service: LlavesLookupsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    service = TestBed.inject(LlavesLookupsService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta los 5 catálogos de apoyo en los endpoints de sus módulos dueños', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => {
      expect(service.salones.data()).toEqual([salonDto]);
      expect(service.personas.data()).toEqual([personaDto]);
      expect(service.usuarios.data()).toEqual([usuarioDto]);
      expect(service.novedades.data()).toEqual([novedadDto]);
    });
  });

  it('resuelve el nombre de cada FK y cae al id crudo si el lookup aún no cargó', async () => {
    // Antes de responder: los lookups están vacíos, así que se muestra el id.
    expect(service.nombreSalon('s-1')).toBe('s-1');
    expect(service.nombrePersona('p-1')).toBe('p-1');
    expect(service.nombreUsuario('us-1')).toBe('us-1');
    expect(service.nombreUbicacion('ub-1')).toBe('ub-1');

    responderLookups(httpMock);

    await vi.waitFor(() => {
      expect(service.nombreSalon('s-1')).toBe('Aula 101');
      expect(service.nombrePersona('p-1')).toBe('Ana Docente');
      expect(service.nombreUsuario('us-1')).toBe('Vigilante Uno');
      expect(service.nombreUbicacion('ub-1')).toBe('Portería');
    });
    // Un id desconocido tampoco rompe: se muestra tal cual.
    expect(service.nombreSalon('s-desconocido')).toBe('s-desconocido');
  });

  it('arma las opciones de los selectores desambiguando personas, usuarios inactivos y novedades', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => expect(service.opcionesPersonas().length).toBe(1));
    expect(service.opcionesPersonas()).toEqual([{ label: 'Ana Docente (1001)', value: 'p-1' }]);
    expect(service.opcionesUsuarios()).toEqual([{ label: 'Vigilante Uno', value: 'us-1' }]);
    expect(service.opcionesNovedades()).toEqual([{ label: 'llave — Llave rayada', value: 'n-1' }]);
  });

  it('ordena las ubicaciones de entrega poniendo primero las que permiten préstamo (sin excluir ninguna)', async () => {
    responderLookups(httpMock);

    await vi.waitFor(() => expect(service.ubicacionesEntrega().length).toBe(2));
    // La que permite préstamo queda primero aunque el backend la devolvió
    // segunda; la que no lo permite SIGUE en la lista (el bloqueo es
    // responsabilidad del backend, ver llaves-error.util.ts).
    expect(service.ubicacionesEntrega().map((ubicacion) => ubicacion.id)).toEqual(['ub-1', 'ub-2']);
    expect(service.ubicacionesDevolucion().map((ubicacion) => ubicacion.id)).toEqual([
      'ub-1',
      'ub-2',
    ]);
  });
});
