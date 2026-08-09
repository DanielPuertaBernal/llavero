import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import type { Ubicacion } from '../catalogos.models';
import { UbicacionFormDialogComponent } from './ubicacion-form-dialog.component';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/ubicaciones`;

// Ver la nota en bloques.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP de forma asíncrona, un tick después de crear el
// componente o de invocar un método que llama `mutate*`.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const ubicacionExistente: Ubicacion = {
  id: 'u-1',
  nombre: 'Biblioteca',
  permite_prestamo_llaves: true,
  permite_devolucion_llaves: true,
  permite_prestamo_equipos: false,
};

interface UbicacionFormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

describe('UbicacionFormDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UbicacionFormDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        MessageService,
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('en modo creación, guardar hace POST con nombre y los 3 flags de permiso', async () => {
    const fixture = TestBed.createComponent(UbicacionFormDialogComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UbicacionFormDialogInternals;
    component.form.setValue({
      nombre: 'Portería',
      permite_prestamo_llaves: true,
      permite_devolucion_llaves: false,
      permite_prestamo_equipos: true,
    });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: BASE_URL });
    expect(req.request.body).toEqual({
      nombre: 'Portería',
      permite_prestamo_llaves: true,
      permite_devolucion_llaves: false,
      permite_prestamo_equipos: true,
    });
    const ubicacionCreada = { ...ubicacionExistente, id: 'u-2', ...req.request.body };
    req.flush(ubicacionCreada);
    await cederMicrotask();

    // Refetch tras invalidar `ubicaciones` (query activa en este mismo
    // componente).
    httpMock.expectOne(BASE_URL).flush([ubicacionCreada]);

    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('en modo edición, precarga el formulario y guardar hace PATCH con su id (sin la 4ta flag que no existe en el backend)', async () => {
    const fixture = TestBed.createComponent(UbicacionFormDialogComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([]);
    fixture.componentRef.setInput('ubicacion', ubicacionExistente);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as UbicacionFormDialogInternals;
    expect(component.form.getRawValue()).toEqual({
      nombre: 'Biblioteca',
      permite_prestamo_llaves: true,
      permite_devolucion_llaves: true,
      permite_prestamo_equipos: false,
    });

    component.form.patchValue({ permite_prestamo_equipos: true });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'PATCH', url: `${BASE_URL}/u-1` });
    expect(req.request.body).toEqual({
      nombre: 'Biblioteca',
      permite_prestamo_llaves: true,
      permite_devolucion_llaves: true,
      permite_prestamo_equipos: true,
    });
    const ubicacionActualizada = { ...ubicacionExistente, permite_prestamo_equipos: true };
    req.flush(ubicacionActualizada);
    await cederMicrotask();

    httpMock.expectOne(BASE_URL).flush([ubicacionActualizada]);
  });
});
