import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfirmationService, type Confirmation } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { UbicacionesListComponent } from './ubicaciones-list.component';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/ubicaciones`;

// Ver la nota en bloques.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP de forma asíncrona, un tick después de crear el
// componente.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const ubicacionDto = {
  id: 'u-1',
  nombre: 'Biblioteca',
  permite_prestamo_llaves: true,
  permite_devolucion_llaves: true,
  permite_prestamo_equipos: false,
};

interface UbicacionesListInternals {
  abrirCrear(): void;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  ubicacionEditando: import('@angular/core').WritableSignal<unknown>;
}

describe('UbicacionesListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UbicacionesListComponent],
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

  it('renderiza la tabla de ubicaciones con sus 3 flags de permiso', async () => {
    const fixture = TestBed.createComponent(UbicacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(BASE_URL).flush([ubicacionDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Biblioteca');
    });
  });

  it('muestra un mensaje de error si la carga inicial falla (no repite el gap del legacy, ver catalogos.md §8)', async () => {
    const fixture = TestBed.createComponent(UbicacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(BASE_URL).flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las ubicaciones');
    });
  });

  it('"Nueva ubicación" abre el diálogo en modo creación', async () => {
    const fixture = TestBed.createComponent(UbicacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(BASE_URL).flush([ubicacionDto]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UbicacionesListInternals;
    component.abrirCrear();

    expect(component.formDialogVisible()).toBe(true);
    expect(component.ubicacionEditando()).toBeNull();
  });

  it('eliminar ubicación pide confirmación y, al aceptar, hace DELETE', async () => {
    const fixture = TestBed.createComponent(UbicacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(BASE_URL).flush([ubicacionDto]);

    // `ConfirmationService` está provisto a nivel de
    // `UbicacionesListComponent` (ver su decorator), no a nivel de módulo.
    const confirmationService = fixture.debugElement.injector.get(ConfirmationService);
    const confirmSpy = vi.spyOn(confirmationService, 'confirm');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Biblioteca');
    });

    const botonEliminar = fixture.nativeElement.querySelector(
      'button[aria-label="Eliminar ubicación"]',
    ) as HTMLElement;
    expect(botonEliminar).toBeTruthy();
    botonEliminar.click();

    expect(confirmSpy).toHaveBeenCalledOnce();
    const confirmacion: Confirmation = confirmSpy.mock.calls[0][0];
    expect(confirmacion.message).toContain('Biblioteca');

    confirmacion.accept?.();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/u-1` })
      .flush(null, { status: 204, statusText: 'No Content' });
    await cederMicrotask();

    // El refetch tras invalidar `ubicaciones` (query activa en este mismo
    // componente) también hay que responderlo.
    httpMock.expectOne(BASE_URL).flush([]);
  });
});
