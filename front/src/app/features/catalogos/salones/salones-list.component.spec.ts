import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { ConfirmService } from '../../../core/shared/confirm.service';
import { environment } from '../../../../environments/environment';
import { SalonesListComponent } from './salones-list.component';

const SALONES_URL = `${environment.apiBaseUrl}/catalogos/salones`;
const BLOQUES_URL = `${environment.apiBaseUrl}/catalogos/bloques`;
const TIPOS_URL = `${environment.apiBaseUrl}/catalogos/tipos-silleteria`;

// Ver la nota en bloques.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP de forma asíncrona, un tick después de crear el
// componente.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const salonDto = {
  id: 's-1',
  nombre: 'Aula 101',
  bloque_id: 'b-1',
  tipo_silleteria_id: 't-1',
  cantidad_sillas: 30,
  cantidad_mesas: 1,
};

interface SalonesListInternals {
  abrirCrear(): void;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  salonEditando: import('@angular/core').WritableSignal<unknown>;
}

describe('SalonesListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalonesListComponent],
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

  async function crearFixtureConDatos() {
    const fixture = TestBed.createComponent(SalonesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(SALONES_URL).flush([salonDto]);
    httpMock.expectOne(BLOQUES_URL).flush([{ id: 'b-1', nombre: 'Bloque A' }]);
    httpMock.expectOne(TIPOS_URL).flush([{ id: 't-1', nombre: 'Fija' }]);
    return fixture;
  }

  it('renderiza la tabla de salones resolviendo el nombre de bloque y tipo de silletería por id', async () => {
    const fixture = await crearFixtureConDatos();

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Aula 101');
      expect(texto).toContain('Bloque A');
      expect(texto).toContain('Fija');
    });
  });

  it('muestra un mensaje de error si la carga de salones falla', async () => {
    const fixture = TestBed.createComponent(SalonesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(SALONES_URL).flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(BLOQUES_URL).flush([]);
    httpMock.expectOne(TIPOS_URL).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar los salones');
    });
  });

  it('"Nuevo salón" abre el diálogo en modo creación (sin salón precargado)', async () => {
    const fixture = await crearFixtureConDatos();
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as SalonesListInternals;
    component.abrirCrear();

    expect(component.formDialogVisible()).toBe(true);
    expect(component.salonEditando()).toBeNull();
  });

  it('eliminar salón pide confirmación y, al aceptar, hace DELETE', async () => {
    const fixture = await crearFixtureConDatos();
    // `ConfirmService` es `providedIn: 'root'`, se puede resolver desde
    // `TestBed.inject` directamente.
    const confirmService = TestBed.inject(ConfirmService);
    const confirmarSpy = vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Aula 101');
    });

    const botonEliminar = fixture.nativeElement.querySelector(
      'button[aria-label="Eliminar salón"]',
    ) as HTMLElement;
    expect(botonEliminar).toBeTruthy();
    botonEliminar.click();
    await cederMicrotask();

    expect(confirmarSpy).toHaveBeenCalledOnce();
    expect(confirmarSpy.mock.calls[0][0].mensaje).toContain('Aula 101');

    httpMock
      .expectOne({ method: 'DELETE', url: `${SALONES_URL}/s-1` })
      .flush(
        { detail: 'No se puede eliminar el salon porque tiene registros asociados' },
        { status: 400, statusText: 'Bad Request' },
      );
  });
});
