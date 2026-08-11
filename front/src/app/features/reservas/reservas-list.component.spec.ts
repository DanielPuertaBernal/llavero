import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ReservasListComponent } from './reservas-list.component';
import type { EstadoReserva, Reserva } from './reservas.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/reservas`;

// Ver la nota en reservas.service.spec.ts: `injectQuery` dispara su lado HTTP
// un tick después de crear el componente.
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

const salonDto = {
  id: 'sa-1',
  nombre: 'Aula 201',
  bloque_id: 'bl-1',
  tipo_silleteria_id: 'ts-1',
  cantidad_sillas: 30,
  cantidad_mesas: 15,
};

const reservaAprobada: Reserva = {
  id: 'rv-1',
  salon_id: 'sa-1',
  solicitante_id: 'p-1',
  fecha: '2026-08-20',
  hora_inicio: '08:00:00',
  hora_fin: '10:00:00',
  motivo: 'Asesoría de tesis',
  estado: 'aprobada',
};

const reservaCompletada: Reserva = {
  ...reservaAprobada,
  id: 'rv-2',
  solicitante_id: 'p-9',
  motivo: null,
  estado: 'completada',
};

interface ReservasListInternals {
  onSolicitanteChange(solicitanteId: string | null): void;
  onEstadoChange(estado: EstadoReserva | null): void;
  busqueda: import('@angular/core').WritableSignal<string>;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  cancelacionDialogVisible: import('@angular/core').WritableSignal<boolean>;
  reservaACancelar: import('@angular/core').WritableSignal<Reserva | null>;
  abrirFormulario(): void;
}

/** Los 2 lookups que dispara `ReservasLookupsService` al inyectarse. */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
}

describe('ReservasListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservasListComponent],
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

  it('resuelve salón y solicitante a nombre legible y muestra fecha, franja y estado', async () => {
    const fixture = TestBed.createComponent(ReservasListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaAprobada]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Aula 201');
      expect(texto).toContain('Ana Docente');
      // 20/08, no 19/08: `fecha` es de calendario y no pasa por `Date`.
      expect(texto).toContain('20/08/2026');
      expect(texto).toContain('08:00');
      expect(texto).toContain('Aprobada');
    });
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(ReservasListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las reservas');
    });
  });

  it('el filtro de solicitante consulta al SERVIDOR su endpoint propio', async () => {
    const fixture = TestBed.createComponent(ReservasListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaAprobada, reservaCompletada]);
    responderLookups(httpMock);

    const component = fixture.componentInstance as unknown as ReservasListInternals;
    component.onSolicitanteChange('p-1');
    await cederMicrotask();

    // No es un filtro en memoria: hay una petición nueva a otro endpoint.
    httpMock.expectOne(`${BASE_URL}/solicitante/p-1`).flush([reservaAprobada]);

    // Y volver a "Todos" regresa a la lista completa (ya cacheada, pero
    // TanStack la revalida por estar stale).
    component.onSolicitanteChange(null);
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaAprobada, reservaCompletada]);
  });

  it('el filtro de estado filtra EN MEMORIA, sin pedirle nada al servidor', async () => {
    const fixture = TestBed.createComponent(ReservasListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaAprobada, reservaCompletada]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    });

    const component = fixture.componentInstance as unknown as ReservasListInternals;
    component.onEstadoChange('completada');
    fixture.detectChanges();

    // El backend NO expone `GET /reservas/estado/{estado}` (ver
    // back/reservas/controller.py): este filtro no puede ser una consulta.
    httpMock.expectNone((request) => request.url.includes('/estado/'));
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Completada');
  });

  it('la búsqueda filtra por el nombre ya resuelto del salón, no por su id', async () => {
    const fixture = TestBed.createComponent(ReservasListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush([reservaAprobada, { ...reservaCompletada, salon_id: 'sa-9' }]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Aula 201');
    });

    const component = fixture.componentInstance as unknown as ReservasListInternals;
    component.busqueda.set('aula 201');
    fixture.detectChanges();

    // `rv-2` apunta a `sa-9`, que no está en el lookup: se muestra como id
    // crudo y no coincide con el término.
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('sa-9');
  });

  it('"Cancelar reserva" queda deshabilitado si ya no está aprobada y abre el diálogo si lo está', async () => {
    const fixture = TestBed.createComponent(ReservasListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([reservaAprobada, reservaCompletada]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('button[aria-label="Cancelar reserva"]').length,
      ).toBe(2);
    });

    const botones = fixture.nativeElement.querySelectorAll(
      'button[aria-label="Cancelar reserva"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(botones[0].disabled).toBe(false);
    expect(botones[1].disabled).toBe(true);

    botones[0].click();

    const component = fixture.componentInstance as unknown as ReservasListInternals;
    expect(component.cancelacionDialogVisible()).toBe(true);
    expect(component.reservaACancelar()?.id).toBe('rv-1');
  });

  it('"Registrar reserva" abre el diálogo de registro', async () => {
    const fixture = TestBed.createComponent(ReservasListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    responderLookups(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as ReservasListInternals;
    component.abrirFormulario();

    expect(component.formDialogVisible()).toBe(true);
  });
});
