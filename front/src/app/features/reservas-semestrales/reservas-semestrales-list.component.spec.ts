import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ReservasSemestralesListComponent } from './reservas-semestrales-list.component';
import type { ReservaSemestral } from './reservas-semestrales.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/reservas-semestrales`;

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

const semestreDto = {
  id: 'sem-1',
  codigo: '2026-2',
  fecha_inicio: '2026-08-03',
  fecha_fin: '2026-12-05',
};

const franjaLunes: ReservaSemestral = {
  id: 'rs-1',
  salon_id: 'sa-1',
  solicitante_id: 'p-1',
  semestre_id: 'sem-1',
  dia: 'lunes',
  hora_inicio: '08:00:00',
  hora_fin: '10:00:00',
  grupo_id: 'g-1',
  creado_manualmente: true,
};

const franjaMiercoles: ReservaSemestral = {
  ...franjaLunes,
  id: 'rs-2',
  dia: 'miercoles',
};

const franjaInstitucional: ReservaSemestral = {
  id: 'rs-3',
  salon_id: 'sa-1',
  solicitante_id: 'p-1',
  semestre_id: 'sem-1',
  dia: 'viernes',
  hora_inicio: '14:00:00',
  hora_fin: '16:00:00',
  grupo_id: 'g-2',
  creado_manualmente: false,
};

interface ListInternals {
  busqueda: import('@angular/core').WritableSignal<string>;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  cancelacionDialogVisible: import('@angular/core').WritableSignal<boolean>;
  grupoACancelar: import('@angular/core').Signal<ReservaSemestral[]>;
  abrirFormulario(): void;
  abrirCancelacion(reserva: ReservaSemestral): void;
}

/** Los 3 lookups que dispara `ReservasSemestralesLookupsService` al inyectarse. */
function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
  httpMock.expectOne(`${API}/programacion/semestres`).flush([semestreDto]);
}

describe('ReservasSemestralesListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservasSemestralesListComponent],
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

  it('resuelve salón, solicitante y semestre a texto legible y agrupa las franjas por grupo_id', async () => {
    const fixture = TestBed.createComponent(ReservasSemestralesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([franjaLunes, franjaMiercoles]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Aula 201');
      expect(texto).toContain('Ana Docente');
      expect(texto).toContain('2026-2');
      expect(texto).toContain('Lunes');
      expect(texto).toContain('Miércoles');
      expect(texto).toContain('08:00');
    });
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(ReservasSemestralesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        'No se pudieron cargar las reservas semestrales',
      );
    });
  });

  it('la búsqueda filtra por el nombre ya resuelto del salón, no por su id', async () => {
    const fixture = TestBed.createComponent(ReservasSemestralesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([franjaLunes, franjaInstitucional]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Aula 201');
    });

    const component = fixture.componentInstance as unknown as ListInternals;
    component.busqueda.set('miercoles');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('button[aria-label="Cancelar grupo"]').length,
    ).toBe(0);
  });

  it('"Cancelar grupo" queda deshabilitado si la franja fue cargada institucionalmente', async () => {
    const fixture = TestBed.createComponent(ReservasSemestralesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([franjaLunes, franjaInstitucional]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('button[aria-label="Cancelar grupo"]').length,
      ).toBe(2);
    });

    const botones = fixture.nativeElement.querySelectorAll(
      'button[aria-label="Cancelar grupo"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(botones[0].disabled).toBe(false);
    expect(botones[1].disabled).toBe(true);
  });

  it('"Cancelar grupo" abre el diálogo con TODAS las franjas del grupo de esa fila, no solo la fila', async () => {
    const fixture = TestBed.createComponent(ReservasSemestralesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([franjaLunes, franjaMiercoles, franjaInstitucional]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('button[aria-label="Cancelar grupo"]').length,
      ).toBe(3);
    });

    const component = fixture.componentInstance as unknown as ListInternals;
    component.abrirCancelacion(franjaLunes);

    expect(component.cancelacionDialogVisible()).toBe(true);
    expect(component.grupoACancelar().map((f) => f.id).sort()).toEqual(['rs-1', 'rs-2']);
  });

  it('"Registrar reserva semestral" abre el diálogo de registro', async () => {
    const fixture = TestBed.createComponent(ReservasSemestralesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    responderLookups(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as ListInternals;
    component.abrirFormulario();

    expect(component.formDialogVisible()).toBe(true);
  });
});
