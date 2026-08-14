import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { NovedadesListComponent } from './novedades-list.component';
import type { CategoriaNovedad, EstadoNovedad, Novedad } from './novedades.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/novedades`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioDto = {
  id: 'us-1',
  nombre: 'Ana Vigilante',
  email_institucional: 'ana@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};

const novedadAbierta: Novedad = {
  id: 'nv-1',
  categoria: 'dano',
  descripcion: 'Llave doblada',
  estado: 'abierta',
  solucion: null,
  registrado_por_id: 'us-1',
};

const novedadCerrada: Novedad = {
  ...novedadAbierta,
  id: 'nv-2',
  estado: 'cerrada',
  solucion: 'Se reemplazó la llave',
};

interface NovedadesListInternals {
  filtroEstadoUi: import('@angular/core').WritableSignal<EstadoNovedad | null>;
  filtroCategoriaUi: import('@angular/core').WritableSignal<CategoriaNovedad | null>;
  onEstadoChange(estado: EstadoNovedad | null): void;
  onCategoriaChange(categoria: CategoriaNovedad | null): void;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  cierreDialogVisible: import('@angular/core').WritableSignal<boolean>;
  novedadACerrar: import('@angular/core').WritableSignal<Novedad | null>;
  abrirCrear(): void;
  abrirCierre(novedad: Novedad): void;
}

/** La lista de novedades más el lookup de usuarios que se dispara al inyectarse. */
function responderCargaInicial(httpMock: HttpTestingController, novedades: Novedad[]): void {
  httpMock.expectOne(`${BASE_URL}/`).flush(novedades);
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
}

function botonesCerrar(fixture: { nativeElement: HTMLElement }): NodeListOf<HTMLButtonElement> {
  return fixture.nativeElement.querySelectorAll(
    'button[aria-label="Cerrar novedad"]',
  ) as NodeListOf<HTMLButtonElement>;
}

describe('NovedadesListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NovedadesListComponent],
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

  it('resuelve "registrado por" a nombre legible y etiqueta categoría y estado', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [novedadAbierta, novedadCerrada]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    });

    const celdas = (fila: number) =>
      Array.from(
        fixture.nativeElement.querySelectorAll('tbody tr')[fila].querySelectorAll('td'),
      ).map((celda) => (celda as HTMLElement).textContent?.trim());

    expect(celdas(0)).toEqual(
      expect.arrayContaining(['Daño', 'Llave doblada', 'Ana Vigilante', 'Abierta']),
    );
    expect(celdas(1)).toEqual(
      expect.arrayContaining(['Daño', 'Llave doblada', 'Ana Vigilante', 'Cerrada']),
    );
  });

  it('cae al id crudo mientras el lookup de usuarios no haya cargado', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([novedadAbierta]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('us-1');
    });

    httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las novedades');
    });
  });

  it('el filtro de estado consulta al SERVIDOR y limpia el de categoría', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [novedadAbierta]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Llave doblada');
    });

    const component = fixture.componentInstance as unknown as NovedadesListInternals;
    component.onCategoriaChange('perdida');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/categoria/perdida`).flush([]);

    component.onEstadoChange('cerrada');
    await cederMicrotask();

    // Elegir estado limpia categoría: solo se dispara la consulta de estado.
    httpMock.expectOne(`${BASE_URL}/estado/cerrada`).flush([novedadCerrada]);
    expect(component.filtroCategoriaUi()).toBeNull();
  });

  it('el filtro de categoría consulta al SERVIDOR y limpia el de estado', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [novedadAbierta]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Llave doblada');
    });

    const component = fixture.componentInstance as unknown as NovedadesListInternals;
    component.onEstadoChange('abierta');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/estado/abierta`).flush([novedadAbierta]);

    component.onCategoriaChange('dano');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/categoria/dano`).flush([novedadAbierta]);
    expect(component.filtroEstadoUi()).toBeNull();
  });

  it('deshabilita "Cerrar novedad" en las filas ya cerradas', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [novedadAbierta, novedadCerrada]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesCerrar(fixture).length).toBe(2);
    });

    const botones = botonesCerrar(fixture);
    expect(botones[0].disabled).toBe(false);
    expect(botones[1].disabled).toBe(true);
  });

  it('"Nueva novedad" abre el diálogo de creación', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, []);

    const component = fixture.componentInstance as unknown as NovedadesListInternals;
    component.abrirCrear();

    expect(component.formDialogVisible()).toBe(true);
  });

  it('"Cerrar novedad" abre el diálogo de cierre con la fila seleccionada', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [novedadAbierta]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(botonesCerrar(fixture).length).toBe(1);
    });

    const component = fixture.componentInstance as unknown as NovedadesListInternals;
    botonesCerrar(fixture)[0].click();

    expect(component.novedadACerrar()).toEqual(novedadAbierta);
    expect(component.cierreDialogVisible()).toBe(true);
  });

  it('muestra un mensaje vacío en español cuando ninguna novedad coincide', async () => {
    const fixture = TestBed.createComponent(NovedadesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, []);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No hay novedades');
    });
  });
});
