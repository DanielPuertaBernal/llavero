import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { NotificationService } from '../../core/shared/notification.service';
import { PrestamoDevolucionDialogComponent } from './prestamo-devolucion-dialog.component';
import { PrestamoDetallesService } from './prestamo-detalles.service';
import type { Prestamo } from './prestamos.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/prestamos`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const prestamoActivo: Prestamo = {
  id: 'pr-1',
  solicitante_id: 'p-1',
  usuario_prestamista_id: 'us-1',
  ubicacion_id: 'ub-1',
  estado: 'activo',
  fecha_creacion: '2026-08-09T14:30:00Z',
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
  fecha_devolucion: '2026-08-09T18:00:00Z',
};

const devolucionDto = {
  id: 'dev-1',
  prestamo_id: 'pr-1',
  usuario_recibe_id: 'us-2',
  ubicacion_id: 'ub-2',
  fecha: '2026-08-09T18:00:00Z',
  es_completa: false,
};

interface DevolucionDialogInternals {
  form: import('@angular/forms').FormGroup;
  opcionesEquiposDevolver(): { label: string; value: string }[];
  onNovedadChange(equipoId: string, novedadId: string | null): void;
  guardar(): void;
}

/** El diálogo inyecta `PrestamosService` + `PrestamosLookupsService`: 6 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([]);
  httpMock.expectOne(`${API}/usuarios/`).flush([]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([]);
  httpMock.expectOne(`${API}/equipos/`).flush([
    {
      id: 'eq-1',
      nombre: 'Videobeam',
      marca: 'Epson',
      codigo_inventario: 'INV-001',
      codigo_barras: null,
      estado: 'activo',
    },
  ]);
  httpMock.expectOne(`${API}/novedades/`).flush([
    {
      id: 'n-1',
      categoria: 'equipo',
      descripcion: 'Carcasa rota',
      estado: 'abierta',
      solucion: null,
      registrado_por_id: 'us-1',
    },
  ]);
}

/** Detalles + devoluciones del préstamo seleccionado (instancia propia de
 * `PrestamoDetallesService` provista por este diálogo). */
function responderDetalles(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([detalleEntregado, detalleDevuelto]);
  httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([]);
}

/** Refetch de las 3 consultas activas tras invalidar el prefijo `['prestamos']`. */
function responderRefetch(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([detalleEntregado, detalleDevuelto]);
  httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([devolucionDto]);
}

describe('PrestamoDevolucionDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrestamoDevolucionDialogComponent],
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

  it('sin préstamo seleccionado no consulta detalles ni devoluciones', async () => {
    const fixture = TestBed.createComponent(PrestamoDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();
    await cederMicrotask();

    const detallesService = fixture.debugElement.injector.get(PrestamoDetallesService);
    expect(detallesService.prestamoId()).toBeNull();
    httpMock.expectNone((request) => request.url.includes('/detalles'));
    httpMock.expectNone((request) => request.url.includes('/devoluciones'));
  });

  it('solo ofrece los equipos que siguen entregados en ese préstamo', async () => {
    const fixture = TestBed.createComponent(PrestamoDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('prestamo', prestamoActivo);
    fixture.detectChanges();
    await cederMicrotask();
    responderDetalles(httpMock);

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(component.opcionesEquiposDevolver().length).toBe(1);
    });
    // `eq-2` ya está devuelto: el backend lo rechazaría con 400, así que ni
    // siquiera se ofrece.
    expect(component.opcionesEquiposDevolver()).toEqual([
      { label: 'Videobeam (INV-001)', value: 'eq-1' },
    ]);
  });

  it('OMITE novedades_por_equipo cuando ningún equipo tiene novedad', async () => {
    const fixture = TestBed.createComponent(PrestamoDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('prestamo', prestamoActivo);
    fixture.detectChanges();
    await cederMicrotask();
    responderDetalles(httpMock);

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1'],
    });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/pr-1/devolver` });
    // La clave no viaja ni siquiera como `{}`: el schema la declara opcional
    // y `null` por defecto.
    expect(req.request.body).toEqual({
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1'],
    });
    expect(Object.keys(req.request.body as object)).not.toContain('novedades_por_equipo');
    req.flush(devolucionDto);
    await cederMicrotask();

    responderRefetch(httpMock);
    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('envía novedades_por_equipo solo con los equipos que tienen novedad elegida', async () => {
    const fixture = TestBed.createComponent(PrestamoDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('prestamo', prestamoActivo);
    fixture.detectChanges();
    await cederMicrotask();
    httpMock
      .expectOne(`${BASE_URL}/pr-1/detalles`)
      .flush([detalleEntregado, { ...detalleDevuelto, estado_equipo: 'entregado' }]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([]);

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1', 'eq-2'],
    });
    component.onNovedadChange('eq-1', 'n-1');
    // `eq-2` se marca y se desmarca: no debe quedar en el mapa.
    component.onNovedadChange('eq-2', 'n-1');
    component.onNovedadChange('eq-2', null);

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/pr-1/devolver` });
    expect(req.request.body).toEqual({
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1', 'eq-2'],
      novedades_por_equipo: { 'eq-1': 'n-1' },
    });
    req.flush(devolucionDto);
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    httpMock
      .expectOne(`${BASE_URL}/pr-1/detalles`)
      .flush([detalleEntregado, { ...detalleDevuelto, estado_equipo: 'entregado' }]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([devolucionDto]);
  });

  it('sin equipos seleccionados el formulario es inválido y no sale ninguna petición', async () => {
    const fixture = TestBed.createComponent(PrestamoDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('prestamo', prestamoActivo);
    fixture.detectChanges();
    await cederMicrotask();
    responderDetalles(httpMock);

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: [],
    });
    expect(component.form.invalid).toBe(true);

    component.guardar();
    await cederMicrotask();
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/pr-1/devolver` });
  });

  it('muestra el mensaje del backend tal cual cuando la devolución es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(PrestamoDevolucionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('prestamo', prestamoActivo);
    fixture.detectChanges();
    await cederMicrotask();
    responderDetalles(httpMock);

    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    const component = fixture.componentInstance as unknown as DevolucionDialogInternals;
    component.form.setValue({
      usuario_recibe_id: 'us-2',
      ubicacion_id: 'ub-2',
      equipo_ids: ['eq-1'],
    });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/pr-1/devolver` })
      .flush({ detail: 'El equipo ya fue devuelto' }, { status: 400, statusText: 'Bad Request' });

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'No se pudo registrar la devolución',
        'El equipo ya fue devuelto',
      ),
    );
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
