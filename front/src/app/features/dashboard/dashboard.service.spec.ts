import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { AuthService } from '../../core/auth/auth.service';
import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { environment } from '../../../environments/environment';
import { DashboardService } from './dashboard.service';

const API = environment.apiBaseUrl;

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

function configurarTestBed(usuario: UsuarioAutenticado | null): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      { provide: AuthService, useValue: { currentUser: () => usuario } },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/** Fecha local de hoy en formato `YYYY-MM-DD`, igual que
 * `DashboardService`, para que el test no dependa de codificar una fecha
 * fija que eventualmente quede en el pasado. */
function hoyIso(): string {
  const hoy = new Date();
  const dosDigitos = (valor: number) => String(valor).padStart(2, '0');
  return `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`;
}

describe('DashboardService — KPIs', () => {
  it('llavesFuera cuenta las llaves con estado != entregado', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);

    await vi.waitFor(() => {
      httpMock.expectOne(`${API}/llaves/`).flush([
        { estado: 'en_prestamo' },
        { estado: 'demora_entrega' },
        { estado: 'entregado' },
      ]);
    });

    await vi.waitFor(() => expect(service.llavesFuera()).toBe(2));
  });

  it('llavesFuera es null mientras la consulta está pendiente', () => {
    configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);
    expect(service.llavesFuera()).toBeNull();
  });

  it('prestamosActivos cuenta activo + parcialmente_devuelto, no completamente_devuelto', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);

    await vi.waitFor(() => {
      httpMock.expectOne(`${API}/prestamos/`).flush([
        { estado: 'activo' },
        { estado: 'parcialmente_devuelto' },
        { estado: 'completamente_devuelto' },
      ]);
    });

    await vi.waitFor(() => expect(service.prestamosActivos()).toBe(2));
  });

  it('novedadesAbiertas cuenta solo estado abierta', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);

    await vi.waitFor(() => {
      httpMock
        .expectOne(`${API}/novedades/`)
        .flush([{ estado: 'abierta' }, { estado: 'cerrada' }, { estado: 'abierta' }]);
    });

    await vi.waitFor(() => expect(service.novedadesAbiertas()).toBe(2));
  });

  it('notificacionesFallidas cuenta solo estado_envio fallido', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);

    await vi.waitFor(() => {
      httpMock
        .expectOne(`${API}/notificaciones/`)
        .flush([{ estado_envio: 'enviado' }, { estado_envio: 'fallido' }]);
    });

    await vi.waitFor(() => expect(service.notificacionesFallidas()).toBe(1));
  });

  it('reservasDeHoy cuenta solo reservas aprobadas cuya fecha es hoy', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);

    await vi.waitFor(() => {
      httpMock.expectOne(`${API}/reservas/`).flush([
        { fecha: hoyIso(), estado: 'aprobada' },
        { fecha: hoyIso(), estado: 'cancelada' },
        { fecha: '2000-01-01', estado: 'aprobada' },
      ]);
    });

    await vi.waitFor(() => expect(service.reservasDeHoy()).toBe(1));
  });
});

describe('DashboardService — actividad reciente (RF28)', () => {
  it('Administrador: consulta la lista SIN filtro por usuario_id', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);
    await cederMicrotask();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      httpMock.expectOne(`${API}/historial/`).flush([]);
    });

    await vi.waitFor(() => expect(service.esPortero()).toBe(false));
  });

  it('Portero: consulta la lista CON usuario_id = su propio id', async () => {
    const httpMock = configurarTestBed(usuarioPortero);
    const service = TestBed.inject(DashboardService);
    await cederMicrotask();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    await vi.waitFor(() => {
      httpMock.expectOne(`${API}/historial/?usuario_id=us-portero-1`).flush([]);
    });

    await vi.waitFor(() => expect(service.esPortero()).toBe(true));
  });

  it('ultimosEventos recorta a los primeros 5 (el backend ya ordena descendente)', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const service = TestBed.inject(DashboardService);
    await cederMicrotask();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    const eventos = Array.from({ length: 8 }, (_, indice) => ({
      tipo_recurso: 'llave',
      tipo_evento: 'entrega',
      procesado_por_id: 'us-1',
      fecha_hora: `2026-08-${13 - indice}T10:00:00-05:00`,
    }));
    await vi.waitFor(() => {
      httpMock.expectOne(`${API}/historial/`).flush(eventos);
    });

    await vi.waitFor(() => expect(service.ultimosEventos().length).toBe(5));
    expect(service.ultimosEventos()).toEqual(eventos.slice(0, 5));
  });
});
