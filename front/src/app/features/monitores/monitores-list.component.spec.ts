import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { MonitoresListComponent } from './monitores-list.component';
import type { FiltroEstadoMonitor, Monitor } from './monitores.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/monitores`;

// Ver la nota en usuarios.service.spec.ts: `injectQuery` dispara su lado
// HTTP un tick después de crear el componente.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const docenteDto = {
  id: 'p-1',
  numero_documento: '1001',
  nombre: 'Ana Docente',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: null,
  numero_contacto: null,
  facultad: null,
};

const monitorDelegadoDto = {
  id: 'p-2',
  numero_documento: '2002',
  nombre: 'Bruno Estudiante',
  tipo_persona_id: 'tp-2',
  id_carnet: null,
  correo: null,
  numero_contacto: null,
  facultad: null,
};

const monitoriaActiva: Monitor = {
  id: 'mo-1',
  docente_titular_id: 'p-1',
  monitor_delegado_id: 'p-2',
  materia: 'Estructuras de Datos',
  aula: 'B-201',
  dia: 'lunes',
  horario: '14:00 - 16:00',
  activo: true,
};

const monitoriaInactiva: Monitor = {
  ...monitoriaActiva,
  id: 'mo-2',
  materia: 'Bases de Datos',
  activo: false,
};

interface MonitoresListInternals {
  busqueda: import('@angular/core').WritableSignal<string>;
  filtroEstado: import('@angular/core').WritableSignal<FiltroEstadoMonitor>;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  onEstadoChange(estado: FiltroEstadoMonitor): void;
  abrirCrear(): void;
}

/** La lista de monitores más el lookup de comunidad que se disparan al inyectarse. */
function responderCargaInicial(httpMock: HttpTestingController, monitores: Monitor[]): void {
  httpMock.expectOne(`${BASE_URL}/`).flush(monitores);
  httpMock.expectOne(`${API}/comunidad/`).flush([docenteDto, monitorDelegadoDto]);
}

function botonesPorEtiqueta(
  fixture: { nativeElement: HTMLElement },
  etiqueta: string,
): NodeListOf<HTMLButtonElement> {
  return fixture.nativeElement.querySelectorAll(
    `button[aria-label="${etiqueta}"]`,
  ) as NodeListOf<HTMLButtonElement>;
}

function botonesDesactivar(fixture: { nativeElement: HTMLElement }): NodeListOf<HTMLButtonElement> {
  return botonesPorEtiqueta(fixture, 'Desactivar monitoría');
}

describe('MonitoresListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitoresListComponent],
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

  it('resuelve docente titular y monitor delegado a nombre legible y etiqueta el estado', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [monitoriaActiva, monitoriaInactiva]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    });

    const celdas = (fila: number) =>
      Array.from(
        fixture.nativeElement.querySelectorAll('tbody tr')[fila].querySelectorAll('td'),
      ).map((celda) => (celda as HTMLElement).textContent?.trim());

    expect(celdas(0)).toEqual(
      expect.arrayContaining(['Ana Docente', 'Bruno Estudiante', 'Estructuras de Datos', 'Activa']),
    );
    expect(celdas(1)).toEqual(
      expect.arrayContaining(['Ana Docente', 'Bruno Estudiante', 'Bases de Datos', 'Inactiva']),
    );
  });

  it('cae al id crudo mientras el lookup de comunidad no haya cargado', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([monitoriaActiva]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('p-1');
    });

    httpMock.expectOne(`${API}/comunidad/`).flush([docenteDto, monitorDelegadoDto]);
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${API}/comunidad/`).flush([docenteDto, monitorDelegadoDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las monitorías');
    });
  });

  it('el filtro de estado es de CLIENTE: no dispara ninguna petición nueva', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [monitoriaActiva, monitoriaInactiva]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Estructuras de Datos');
    });

    const component = fixture.componentInstance as unknown as MonitoresListInternals;
    component.onEstadoChange('inactivos');
    await cederMicrotask();
    fixture.detectChanges();

    httpMock.expectNone(`${BASE_URL}/`);
    expect(fixture.nativeElement.textContent).toContain('Bases de Datos');
    expect(fixture.nativeElement.textContent).not.toContain('Estructuras de Datos');

    component.onEstadoChange('activos');
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectNone(`${BASE_URL}/`);
    expect(fixture.nativeElement.textContent).toContain('Estructuras de Datos');
    expect(fixture.nativeElement.textContent).not.toContain('Bases de Datos');
  });

  it('la búsqueda de texto filtra por materia', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [monitoriaActiva, monitoriaInactiva]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Estructuras de Datos');
    });

    const component = fixture.componentInstance as unknown as MonitoresListInternals;
    component.busqueda.set('bases');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Bases de Datos');
    expect(fixture.nativeElement.textContent).not.toContain('Estructuras de Datos');
  });

  it('deshabilita "Desactivar monitoría" en las monitorías ya inactivas', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [monitoriaActiva, monitoriaInactiva]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesDesactivar(fixture).length).toBe(2);
    });

    const botones = botonesDesactivar(fixture);
    expect(botones[0].disabled).toBe(false);
    expect(botones[1].disabled).toBe(true);
  });

  it('"Desactivar monitoría" abre el diálogo de desactivación con la fila elegida', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [monitoriaActiva]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesDesactivar(fixture).length).toBe(1);
    });

    botonesDesactivar(fixture)[0].click();
    fixture.detectChanges();

    const dialogo = fixture.nativeElement.querySelector('app-monitor-desactivacion-dialog');
    expect(dialogo).not.toBeNull();
  });

  it('"Nueva monitoría" abre el diálogo de creación', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, []);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as MonitoresListInternals;
    component.abrirCrear();

    expect(component.formDialogVisible()).toBe(true);
  });

  it('muestra un mensaje vacío en español cuando ninguna monitoría coincide', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, []);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No hay monitorías');
    });
  });

  it('cada fila puede expandirse para ver las clases del docente titular', async () => {
    const fixture = TestBed.createComponent(MonitoresListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [monitoriaActiva]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('button[aria-label="Ver clases del docente titular"]'),
      ).not.toBeNull();
    });

    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Ver clases del docente titular"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/mo-1/clases-docente-titular`).flush([]);
  });
});
