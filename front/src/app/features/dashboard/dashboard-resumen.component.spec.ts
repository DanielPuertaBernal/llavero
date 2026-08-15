import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
import { DashboardResumenComponent } from './dashboard-resumen.component';

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

const usuarioLookupDto = { id: 'us-portero-1', nombre: 'Pedro Portero' };

const eventoLlave = {
  tipo_recurso: 'llave',
  tipo_evento: 'entrega',
  procesado_por_id: 'us-portero-1',
  fecha_hora: '2026-08-13T14:00:00-05:00',
};

function configurarTestBed(usuario: UsuarioAutenticado | null): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [DashboardResumenComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      { provide: AuthService, useValue: { currentUser: () => usuario } },
    ],
  }).compileComponents();
  return TestBed.inject(HttpTestingController);
}

function flushRolYKpis(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
  httpMock.expectOne(`${API}/llaves/`).flush([{ estado: 'en_prestamo' }, { estado: 'entregado' }]);
  httpMock.expectOne(`${API}/prestamos/`).flush([{ estado: 'activo' }]);
  httpMock.expectOne(`${API}/novedades/`).flush([{ estado: 'abierta' }, { estado: 'abierta' }]);
  httpMock.expectOne(`${API}/notificaciones/`).flush([{ estado_envio: 'fallido' }]);
  httpMock.expectOne(`${API}/reservas/`).flush([]);
}

describe('DashboardResumenComponent', () => {
  it('Administrador: muestra los 5 KPI calculados y NO el aviso de Portero', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(DashboardResumenComponent);
    await cederMicrotask();
    fixture.detectChanges();

    flushRolYKpis(httpMock);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${API}/historial/`).flush([eventoLlave]);
    });
    httpMock.expectOne(`${API}/usuarios/`).flush([usuarioLookupDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('1'); // Llaves fuera
    });

    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Llaves fuera');
    expect(texto).toContain('Préstamos activos');
    expect(texto).toContain('Novedades abiertas');
    expect(texto).toContain('Notificaciones fallidas');
    expect(texto).toContain('Reservas de hoy');
    expect(texto).not.toContain('Mostrando solo tus registros');
    httpMock.verify();
  });

  it('Portero: filtra la actividad reciente por su propio usuario_id y muestra el aviso', async () => {
    const httpMock = configurarTestBed(usuarioPortero);
    const fixture = TestBed.createComponent(DashboardResumenComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    httpMock.expectOne(`${API}/llaves/`).flush([]);
    httpMock.expectOne(`${API}/prestamos/`).flush([]);
    httpMock.expectOne(`${API}/novedades/`).flush([]);
    httpMock.expectOne(`${API}/notificaciones/`).flush([]);
    httpMock.expectOne(`${API}/reservas/`).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${API}/historial/?usuario_id=us-portero-1`).flush([eventoLlave]);
    });
    httpMock.expectOne(`${API}/usuarios/`).flush([usuarioLookupDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Mostrando solo tus registros');
    });
    httpMock.verify();
  });

  it('muestra un mensaje de error en la tarjeta de un KPI cuya consulta falla', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(DashboardResumenComponent);
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectOne(`${API}/catalogos/roles`).flush([rolAdminDto, rolPorteroDto]);
    httpMock
      .expectOne(`${API}/llaves/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${API}/prestamos/`).flush([]);
    httpMock.expectOne(`${API}/novedades/`).flush([]);
    httpMock.expectOne(`${API}/notificaciones/`).flush([]);
    httpMock.expectOne(`${API}/reservas/`).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${API}/historial/`).flush([]);
    });
    httpMock.expectOne(`${API}/usuarios/`).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudo cargar. Intenta de nuevo.');
    });
    httpMock.verify();
  });

  it('la actividad reciente enlaza a /historial y ninguna tarjeta tiene botones de escritura (feature de solo lectura)', async () => {
    const httpMock = configurarTestBed(usuarioAdmin);
    const fixture = TestBed.createComponent(DashboardResumenComponent);
    await cederMicrotask();
    fixture.detectChanges();

    flushRolYKpis(httpMock);
    await vi.waitFor(() => {
      fixture.detectChanges();
      httpMock.expectOne(`${API}/historial/`).flush([]);
    });
    httpMock.expectOne(`${API}/usuarios/`).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const enlaceHistorial = fixture.nativeElement.querySelector('a[href="/historial"]');
      expect(enlaceHistorial).toBeTruthy();
    });

    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    httpMock.verify();
  });
});
