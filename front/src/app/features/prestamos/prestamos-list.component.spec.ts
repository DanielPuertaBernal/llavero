import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { PrestamosListComponent } from './prestamos-list.component';
import type { EstadoPrestamo, Prestamo } from './prestamos.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/prestamos`;

// Ver la nota en prestamos.service.spec.ts: `injectQuery` dispara su lado
// HTTP un tick después de crear el componente.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

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
const ubicacionDto = {
  id: 'ub-1',
  nombre: 'Almacén',
  permite_prestamo_llaves: false,
  permite_devolucion_llaves: false,
  permite_prestamo_equipos: true,
};

const prestamoActivo: Prestamo = {
  id: 'pr-1',
  solicitante_id: 'p-1',
  usuario_prestamista_id: 'us-1',
  ubicacion_id: 'ub-1',
  estado: 'activo',
  fecha_creacion: '2026-08-09T14:30:00Z',
};

const prestamoDevuelto: Prestamo = {
  ...prestamoActivo,
  id: 'pr-2',
  solicitante_id: 'p-9',
  estado: 'completamente_devuelto',
};

interface PrestamosListInternals {
  onEstadoChange(estado: EstadoPrestamo | null): void;
  busqueda: import('@angular/core').WritableSignal<string>;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  devolucionDialogVisible: import('@angular/core').WritableSignal<boolean>;
  prestamoADevolver: import('@angular/core').WritableSignal<Prestamo | null>;
  abrirFormulario(): void;
}

/** Los 5 lookups que dispara `PrestamosLookupsService` al inyectarse. */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([ubicacionDto]);
  httpMock.expectOne(`${API}/equipos/`).flush([]);
  httpMock.expectOne(`${API}/novedades/`).flush([]);
}

describe('PrestamosListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrestamosListComponent],
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

  it('resuelve solicitante, prestamista y ubicación a nombre legible y muestra la etiqueta del estado', async () => {
    const fixture = TestBed.createComponent(PrestamosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoActivo]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Ana Docente');
      expect(texto).toContain('Auxiliar Uno');
      expect(texto).toContain('Almacén');
      expect(texto).toContain('Activo');
    });
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(PrestamosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar los préstamos');
    });
  });

  it('el filtro de estado consulta al SERVIDOR el endpoint por estado', async () => {
    const fixture = TestBed.createComponent(PrestamosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoActivo, prestamoDevuelto]);
    responderLookups(httpMock);

    const component = fixture.componentInstance as unknown as PrestamosListInternals;
    component.onEstadoChange('completamente_devuelto');
    await cederMicrotask();

    // No es un filtro en memoria: hay una petición nueva a otro endpoint.
    httpMock.expectOne(`${BASE_URL}/estado/completamente_devuelto`).flush([prestamoDevuelto]);

    // Y volver a "Todos" regresa a la lista completa (ya cacheada, pero
    // TanStack la revalida por estar stale).
    component.onEstadoChange(null);
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoActivo, prestamoDevuelto]);
  });

  it('la búsqueda filtra por el nombre ya resuelto del solicitante, no por su id', async () => {
    const fixture = TestBed.createComponent(PrestamosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoActivo, prestamoDevuelto]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Ana Docente');
    });

    const component = fixture.componentInstance as unknown as PrestamosListInternals;
    component.busqueda.set('ana docente');
    fixture.detectChanges();

    // `pr-2` apunta a `p-9`, que no está en el lookup: se muestra como id
    // crudo y no coincide con el término.
    expect(fixture.nativeElement.textContent).toContain('Ana Docente');
    expect(fixture.nativeElement.textContent).not.toContain('p-9');
  });

  it('"Devolver equipos" queda deshabilitado en un préstamo completamente devuelto y abre el diálogo en uno activo', async () => {
    const fixture = TestBed.createComponent(PrestamosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoActivo, prestamoDevuelto]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('button[aria-label="Devolver equipos"]').length,
      ).toBe(2);
    });

    const botones = fixture.nativeElement.querySelectorAll(
      'button[aria-label="Devolver equipos"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(botones[0].disabled).toBe(false);
    expect(botones[1].disabled).toBe(true);

    botones[0].click();

    const component = fixture.componentInstance as unknown as PrestamosListInternals;
    expect(component.devolucionDialogVisible()).toBe(true);
    expect(component.prestamoADevolver()?.id).toBe('pr-1');
  });

  it('expandir una fila carga los detalles y las devoluciones de ESE préstamo', async () => {
    const fixture = TestBed.createComponent(PrestamosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([prestamoActivo]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('button[aria-label="Ver detalle del préstamo"]'),
      ).toBeTruthy();
    });

    const toggler = fixture.nativeElement.querySelector(
      'button[aria-label="Ver detalle del préstamo"]',
    ) as HTMLButtonElement;
    toggler.click();
    fixture.detectChanges();
    await cederMicrotask();
    fixture.detectChanges();
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/pr-1/detalles`).flush([]);
    httpMock.expectOne(`${BASE_URL}/pr-1/devoluciones`).flush([]);
  });

  it('"Registrar préstamo" abre el diálogo de registro', async () => {
    const fixture = TestBed.createComponent(PrestamosListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    responderLookups(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as PrestamosListInternals;
    component.abrirFormulario();

    expect(component.formDialogVisible()).toBe(true);
  });
});
