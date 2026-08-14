import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ComunidadListComponent } from './comunidad-list.component';
import type { Persona } from './comunidad.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/comunidad`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const tipoPersonaDto = {
  id: 'tp-1',
  nombre: 'Estudiante',
};

const personaCompleta: Persona = {
  id: 'p-1',
  numero_documento: '123456789',
  nombre: 'Ana Estudiante',
  tipo_persona_id: 'tp-1',
  id_carnet: 'C-001',
  correo: 'ana@uco.edu.co',
  numero_contacto: '3001234567',
  facultad: 'Ingenieria',
};

const personaConNulos: Persona = {
  id: 'p-2',
  numero_documento: '987654321',
  nombre: 'Bruno Empleado',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: null,
  numero_contacto: null,
  facultad: null,
};

function responderCargaInicial(httpMock: HttpTestingController, personas: Persona[]): void {
  httpMock.expectOne(`${BASE_URL}/`).flush(personas);
  httpMock.expectOne(`${API}/catalogos/tipos-persona`).flush([tipoPersonaDto]);
}

describe('ComunidadListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComunidadListComponent],
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

  it('resuelve el tipo de persona a nombre legible y muestra las columnas de contacto', async () => {
    const fixture = TestBed.createComponent(ComunidadListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [personaCompleta]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    });

    const filaHtml = fixture.nativeElement.querySelectorAll('tbody tr')[0] as HTMLElement;
    const celdasNodos = Array.from(filaHtml.querySelectorAll('td'));
    const celdas = celdasNodos.map((celda) => (celda as HTMLElement).textContent?.trim());

    const esperado: (string | undefined)[] = [];
    esperado.push('Ana Estudiante');
    esperado.push('123456789');
    esperado.push('Estudiante');
    esperado.push('ana@uco.edu.co');
    esperado.push('3001234567');
    esperado.push('Ingenieria');
    esperado.push('C-001');

    expect(celdas).toEqual(esperado);
  });

  it('muestra un guion largo cuando el dato de contacto es nulo', async () => {
    const fixture = TestBed.createComponent(ComunidadListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [personaConNulos]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    });

    const fila = fixture.nativeElement.querySelectorAll('tbody tr')[0] as HTMLElement;
    const celdasNulos = Array.from(fila.querySelectorAll('td')).map(
      (celda) => (celda as HTMLElement).textContent?.trim(),
    );

    expect(celdasNulos[3]).toBe('—');
    expect(celdasNulos[4]).toBe('—');
    expect(celdasNulos[5]).toBe('—');
    expect(celdasNulos[6]).toBe('—');
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(ComunidadListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    const req = httpMock.expectOne(`${BASE_URL}/`);
    const opcionesError = {
      status: 500,
      statusText: 'Server Error',
    };
    req.flush({ detail: 'error' }, opcionesError);
    httpMock.expectOne(`${API}/catalogos/tipos-persona`).flush([tipoPersonaDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
    });
  });

  it('el filtro de busqueda es de CLIENTE y coincide por nombre o por numero de documento', async () => {
    const fixture = TestBed.createComponent(ComunidadListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [personaCompleta, personaConNulos]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Ana Estudiante');
    });

    const component = fixture.componentInstance as unknown as ComunidadListInternals;
    component.busqueda.set('bruno');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Bruno Empleado');
    expect(fixture.nativeElement.textContent).not.toContain('Ana Estudiante');

    component.busqueda.set('123456789');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ana Estudiante');
    expect(fixture.nativeElement.textContent).not.toContain('Bruno Empleado');
  });

  it('muestra un mensaje en español cuando ninguna persona coincide', async () => {
    const fixture = TestBed.createComponent(ComunidadListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, []);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No hay personas');
    });
  });

  it('no renderiza ningun boton de crear, editar ni eliminar (RF25/RF26: feature de solo lectura)', async () => {
    const fixture = TestBed.createComponent(ComunidadListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    responderCargaInicial(httpMock, [personaCompleta]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    });

    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
  });
});

interface ComunidadListInternals {
  busqueda: import('@angular/core').WritableSignal<string>;
}
