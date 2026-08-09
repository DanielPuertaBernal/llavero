import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { LlavesListComponent } from './llaves-list.component';
import type { EstadoLlave, Llave } from './llaves.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/llaves`;

// Ver la nota en llaves.service.spec.ts: `injectQuery` dispara su lado HTTP
// un tick después de crear el componente.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const salonDto = { id: 's-1', nombre: 'Aula 101' };
const personaTitularDto = {
  id: 'p-1',
  numero_documento: '1001',
  nombre: 'Ana Docente',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: null,
  numero_contacto: null,
  facultad: null,
};
const personaReclamaDto = { ...personaTitularDto, id: 'p-2', nombre: 'Bruno Monitor' };

const llaveEnPrestamo: Llave = {
  id: 'l-1',
  salon_id: 's-1',
  docente_titular_id: 'p-1',
  reclamado_por_id: 'p-2',
  origen: 'manual',
  tipo_entrega: 'credencial',
  tipo_devolucion: null,
  usuario_entrega_id: 'us-1',
  usuario_recibe_id: null,
  ubicacion_entrega_id: 'ub-1',
  ubicacion_devolucion_id: null,
  novedad_id: null,
  fecha_hora_entrega: '2026-08-09T14:30:00Z',
  fecha_hora_devolucion: null,
  estado: 'en_prestamo',
};

const llaveEntregada: Llave = {
  ...llaveEnPrestamo,
  id: 'l-2',
  salon_id: 's-2',
  estado: 'entregado',
  tipo_devolucion: 'manual',
  fecha_hora_devolucion: '2026-08-09T18:00:00Z',
};

interface LlavesListInternals {
  onEstadoChange(estado: EstadoLlave | null): void;
  busqueda: import('@angular/core').WritableSignal<string>;
  entregaDialogVisible: import('@angular/core').WritableSignal<boolean>;
  devolucionDialogVisible: import('@angular/core').WritableSignal<boolean>;
  llaveADevolver: import('@angular/core').WritableSignal<Llave | null>;
  abrirEntrega(): void;
}

/** Los 5 lookups que dispara `LlavesLookupsService` al inyectarse. */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
  httpMock.expectOne(`${API}/catalogos/ubicaciones`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([personaTitularDto, personaReclamaDto]);
  httpMock.expectOne(`${API}/usuarios/`).flush([]);
  httpMock.expectOne(`${API}/novedades/`).flush([]);
}

describe('LlavesListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LlavesListComponent],
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

  it('resuelve salón y personas a nombre legible y muestra la etiqueta del estado', async () => {
    const fixture = TestBed.createComponent(LlavesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveEnPrestamo]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Aula 101');
      expect(texto).toContain('Ana Docente');
      expect(texto).toContain('Bruno Monitor');
      expect(texto).toContain('En préstamo');
      expect(texto).toContain('Credencial');
    });
  });

  it('cae al id crudo mientras los lookups no hayan cargado', async () => {
    const fixture = TestBed.createComponent(LlavesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveEnPrestamo]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('s-1');
    });

    responderLookups(httpMock);
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(LlavesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las llaves');
    });
  });

  it('el filtro de estado consulta al SERVIDOR el endpoint por estado', async () => {
    const fixture = TestBed.createComponent(LlavesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveEnPrestamo, llaveEntregada]);
    responderLookups(httpMock);

    const component = fixture.componentInstance as unknown as LlavesListInternals;
    component.onEstadoChange('entregado');
    await cederMicrotask();

    // No es un filtro en memoria: hay una petición nueva a otro endpoint.
    httpMock.expectOne(`${BASE_URL}/estado/entregado`).flush([llaveEntregada]);

    // Y volver a "Todas" regresa a la lista completa (ya cacheada, pero
    // TanStack la revalida por estar stale).
    component.onEstadoChange(null);
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveEnPrestamo, llaveEntregada]);
  });

  it('la búsqueda filtra por el nombre ya resuelto del salón, no por su id', async () => {
    const fixture = TestBed.createComponent(LlavesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveEnPrestamo, llaveEntregada]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Aula 101');
    });

    const component = fixture.componentInstance as unknown as LlavesListInternals;
    component.busqueda.set('aula 101');
    fixture.detectChanges();

    // `l-2` apunta a `s-2`, que no está en el lookup: se muestra como id
    // crudo y no coincide con el término.
    expect(fixture.nativeElement.textContent).toContain('Aula 101');
    expect(fixture.nativeElement.textContent).not.toContain('s-2');
  });

  it('"Registrar devolución" queda deshabilitado en una llave ya entregada y abre el diálogo en una en préstamo', async () => {
    const fixture = TestBed.createComponent(LlavesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([llaveEnPrestamo, llaveEntregada]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('button[aria-label="Registrar devolución"]').length,
      ).toBe(2);
    });

    const botones = fixture.nativeElement.querySelectorAll(
      'button[aria-label="Registrar devolución"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(botones[0].disabled).toBe(false);
    expect(botones[1].disabled).toBe(true);

    botones[0].click();

    const component = fixture.componentInstance as unknown as LlavesListInternals;
    expect(component.devolucionDialogVisible()).toBe(true);
    expect(component.llaveADevolver()?.id).toBe('l-1');
  });

  it('"Registrar entrega" abre el diálogo de entrega', async () => {
    const fixture = TestBed.createComponent(LlavesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    responderLookups(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as LlavesListInternals;
    component.abrirEntrega();

    expect(component.entregaDialogVisible()).toBe(true);
  });
});
