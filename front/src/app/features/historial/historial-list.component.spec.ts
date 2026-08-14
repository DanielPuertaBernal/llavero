import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
import { HistorialListComponent } from './historial-list.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/historial`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const rolAdminDto = { id: 'r-admin', nombre: 'Administrador' };
const rolPorteroDto = { id: 'r-portero', nombre: 'Portero' };

const usuarioAdmin: UsuarioAutenticado = {
  id: 'us-admin-1',
  nombre: 'Ana Admin',
  emailInstitucional: 'ana@uco.edu.co',
  rolId: 'r-admin',
  ubicacionId: 'ub-1',
};

const usuarioPortero: UsuarioAutenticado = {
  id: 'us-portero-1',
  nombre: 'Pedro Portero',
  emailInstitucional: 'pedro@uco.edu.co',
  rolId: 'r-portero',
  ubicacionId: 'ub-1',
};

const usuarioLookupDto = { id: 'us-portero-1', nombre: 'Pedro Portero' };
const personaDocenteDto = { id: 'p-1', nombre: 'Diana Docente' };
const personaReclamaDto = { id: 'p-2', nombre: 'Carlos Reclama' };
const personaSolicitanteDto = { id: 'p-3', nombre: 'Sofia Solicitante' };
const salonDto = { id: 'sa-1', nombre: 'Salón 101' };
const equipoDto = { id: 'eq-1', nombre: 'Videobeam Epson' };

const eventoLlave = {
  tipo_recurso: 'llave',
  tipo_evento: 'entrega',
  procesado_por_id: 'us-portero-1',
  fecha_hora: '2026-08-13T14:00:00-05:00',
  llave_id: 'll-1',
  salon_id: 'sa-1',
  docente_titular_id: 'p-1',
  reclamado_por_id: 'p-2',
  prestamo_id: null,
  solicitante_id: null,
  equipo_ids: null,
};

const eventoEquipoEntrega = {
  tipo_recurso: 'equipo',
  tipo_evento: 'entrega',
  procesado_por_id: 'us-portero-1',
  fecha_hora: '2026-08-13T10:00:00-05:00',
  llave_id: null,
  salon_id: null,
  docente_titular_id: null,
  reclamado_por_id: null,
  prestamo_id: 'pr-1',
  solicitante_id: 'p-3',
  equipo_ids: ['eq-1'],
};

const eventoEquipoDevolucion = {
  tipo_recurso: 'equipo',
  tipo_evento: 'devolucion',
  procesado_por_id: 'us-portero-1',
  fecha_hora: '2026-08-13T09:00:00-05:00',
  llave_id: null,
  salon_id: null,
  docente_titular_id: null,
  reclamado_por_id: null,
  prestamo_id: 'pr-1',
  solicitante_id: 'p-3',
  equipo_ids: null,
};

function configurarTestBed(usuario: UsuarioAutenticado | null): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [HistorialListComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      { provide: AuthService, useValue: { currentUser: () => usuario } },
    ],
  }).compileComponents();
  return TestBed.inject(HttpTestingController);
}

function flushLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioLookupDto]);
  httpMock
    .expectOne(`${API}/comunidad/`)
    .flush([personaDocenteDto, personaReclamaDto, personaSolicitanteDto]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
  httpMock.expectOne(`${API}/equipos/`).flush([equipoDto]);
}

describe('HistorialListComponent', () => {
  it('Administrador: consulta la lista completa y NO muestra el aviso de Portero', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(HistorialListComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${BASE_URL}/`).flush([eventoLlave]);
    });
    flushLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    });

    expect(fixture.nativeElement.textContent).not.toContain('Mostrando solo tus registros');
    httpMock.verify();
  });

  it('Portero: filtra por su propio usuario_id y muestra el aviso "Mostrando solo tus registros"', async () => {
    const httpMock = configurarTestBed(usuarioPortero);
    const fixture = TestBed.createComponent(HistorialListComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${BASE_URL}/?usuario_id=us-portero-1`).flush([eventoLlave]);
    });
    flushLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Mostrando solo tus registros');
    });
    httpMock.verify();
  });

  it('evento de llave: la columna detalle muestra salon, docente titular y reclamado por', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(HistorialListComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${BASE_URL}/`).flush([eventoLlave]);
    });
    flushLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Salón 101');
    });

    expect(fixture.nativeElement.textContent).toContain('Diana Docente');
    expect(fixture.nativeElement.textContent).toContain('Carlos Reclama');
    httpMock.verify();
  });

  it('evento de equipo (entrega): la columna detalle muestra solicitante y los nombres de los equipos', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(HistorialListComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${BASE_URL}/`).flush([eventoEquipoEntrega]);
    });
    flushLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Sofia Solicitante');
    });

    expect(fixture.nativeElement.textContent).toContain('Videobeam Epson');
    httpMock.verify();
  });

  it('evento de equipo (devolucion): sin equipo_ids, la columna detalle muestra un guion largo', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(HistorialListComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${BASE_URL}/`).flush([eventoEquipoDevolucion]);
    });
    flushLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Sofia Solicitante');
    });

    expect(fixture.nativeElement.textContent).toContain('—');
    httpMock.verify();
  });

  it('muestra un mensaje de error si la carga de la lista falla', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(HistorialListComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne(`${BASE_URL}/`);
      req.flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    });
    flushLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudo cargar');
    });
    httpMock.verify();
  });

  it('no renderiza ningun boton de crear, editar ni eliminar (RF27: feature de solo lectura)', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(HistorialListComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${BASE_URL}/`).flush([eventoLlave]);
    });
    flushLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    });

    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    httpMock.verify();
  });
});
