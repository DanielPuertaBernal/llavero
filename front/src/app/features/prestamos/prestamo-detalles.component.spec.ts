import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { PrestamoDetallesComponent } from './prestamo-detalles.component';
import { PrestamoDetallesService } from './prestamo-detalles.service';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/prestamos`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const equipoDto = {
  id: 'eq-1',
  nombre: 'Videobeam',
  marca: 'Epson',
  codigo_inventario: 'INV-001',
  codigo_barras: null,
  estado: 'activo',
};
const usuarioDto = {
  id: 'us-2',
  nombre: 'Auxiliar Dos',
  email_institucional: 'aux2@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};
const ubicacionDto = {
  id: 'ub-2',
  nombre: 'Almacén',
  permite_prestamo_llaves: false,
  permite_devolucion_llaves: false,
  permite_prestamo_equipos: true,
};
const novedadDto = {
  id: 'n-1',
  categoria: 'equipo',
  descripcion: 'Carcasa rota',
  estado: 'abierta',
  solucion: null,
  registrado_por_id: 'us-1',
};

const detalleEntregado = {
  id: 'det-1',
  prestamo_id: 'pr-1',
  equipo_id: 'eq-1',
  novedad_id: null,
  estado_equipo: 'entregado',
  fecha_entrega: '2026-08-09T14:30:00Z',
  fecha_devolucion: null,
};

const detalleDevuelto = {
  ...detalleEntregado,
  id: 'det-2',
  equipo_id: 'eq-2',
  estado_equipo: 'devuelto',
  novedad_id: 'n-1',
  fecha_devolucion: '2026-08-09T18:00:00Z',
};

const devolucionParcial = {
  id: 'dev-1',
  prestamo_id: 'pr-1',
  usuario_recibe_id: 'us-2',
  ubicacion_id: 'ub-2',
  fecha: '2026-08-09T18:00:00Z',
  es_completa: false,
};

/** Los 5 lookups que dispara `PrestamosLookupsService` al inyectarse. */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/comunidad/`).flush([]);
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);
  httpMock.expectOne(`${API}/equipos/`).flush([equipoDto]);
  httpMock.expectOne(`${API}/novedades/`).flush([novedadDto]);
}

describe('PrestamoDetallesComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrestamoDetallesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('escribe el prestamoId recibido en su instancia propia de PrestamoDetallesService', async () => {
    const fixture = TestBed.createComponent(PrestamoDetallesComponent);
    fixture.componentRef.setInput('prestamoId', 'pr-1');
    fixture.detectChanges();
    await cederMicrotask();

    // El servicio se resuelve desde el inyector del componente, no del root:
    // cada fila expandida trabaja con su propia instancia.
    const detallesService = fixture.debugElement.injector.get(PrestamoDetallesService);
    expect(detallesService.prestamoId()).toBe('pr-1');

    responderLookups(httpMock);
    httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([]);
  });

  it('renderiza los equipos del préstamo con su estado, fechas y novedad resueltos', async () => {
    const fixture = TestBed.createComponent(PrestamoDetallesComponent);
    fixture.componentRef.setInput('prestamoId', 'pr-1');
    fixture.detectChanges();
    await cederMicrotask();

    responderLookups(httpMock);
    httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([detalleEntregado, detalleDevuelto]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Videobeam (INV-001)');
      expect(texto).toContain('Entregado');
      expect(texto).toContain('Devuelto');
      // La novedad del equipo devuelto se resuelve a texto legible.
      expect(texto).toContain('equipo — Carcasa rota');
      // El equipo sin lookup cargado cae al id crudo, nunca a una celda vacía.
      expect(texto).toContain('eq-2');
    });
  });

  it('renderiza las devoluciones marcando si fueron parciales o completas', async () => {
    const fixture = TestBed.createComponent(PrestamoDetallesComponent);
    fixture.componentRef.setInput('prestamoId', 'pr-1');
    fixture.detectChanges();
    await cederMicrotask();

    responderLookups(httpMock);
    httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([detalleEntregado]);
    httpMock
      .expectOne(`${BASE_URL}/pr-1/devoluciones`)
      .flush([devolucionParcial, { ...devolucionParcial, id: 'dev-2', es_completa: true }]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Parcial');
      expect(texto).toContain('Completa');
      expect(texto).toContain('Auxiliar Dos');
      expect(texto).toContain('Almacén');
    });
  });

  it('muestra un mensaje de error si el detalle del préstamo no se puede cargar', async () => {
    const fixture = TestBed.createComponent(PrestamoDetallesComponent);
    fixture.componentRef.setInput('prestamoId', 'pr-1');
    fixture.detectChanges();
    await cederMicrotask();

    responderLookups(httpMock);
    httpMock
      .expectOne(`${BASE_URL}/pr-1/detalles`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        'No se pudo cargar el detalle del préstamo',
      );
    });
  });
});
