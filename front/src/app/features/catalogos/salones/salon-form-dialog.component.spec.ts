import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import type { Salon } from '../catalogos.models';
import { SalonFormDialogComponent } from './salon-form-dialog.component';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/salones`;

// Ver la nota en bloques.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP de forma asíncrona, un tick después de crear el
// componente o de invocar un método que llama `mutate*`.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const salonExistente: Salon = {
  id: 's-1',
  nombre: 'Aula 101',
  bloque_id: 'b-1',
  tipo_silleteria_id: 't-1',
  cantidad_sillas: 30,
  cantidad_mesas: 1,
};

interface SalonFormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

describe('SalonFormDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalonFormDialogComponent],
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

  it('en modo creación, guardar hace POST con los valores del formulario', async () => {
    const fixture = TestBed.createComponent(SalonFormDialogComponent);
    await cederMicrotask();
    // Query eager de la lista de salones que dispara SalonesService al
    // instanciarse (inyectado internamente por el diálogo) — se descarta,
    // no es lo que este test verifica.
    httpMock.expectOne(BASE_URL).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as SalonFormDialogInternals;
    component.form.setValue({
      nombre: 'Aula 102',
      bloque_id: 'b-1',
      tipo_silleteria_id: 't-1',
      cantidad_sillas: 25,
      cantidad_mesas: 0,
    });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: BASE_URL });
    expect(req.request.body).toEqual({
      nombre: 'Aula 102',
      bloque_id: 'b-1',
      tipo_silleteria_id: 't-1',
      cantidad_sillas: 25,
      cantidad_mesas: 0,
    });
    req.flush({ ...salonExistente, id: 's-2', nombre: 'Aula 102' });
    await cederMicrotask();

    // El refetch tras invalidar `salones` (query activa en este mismo
    // componente) también hay que responderlo.
    httpMock.expectOne(BASE_URL).flush([{ ...salonExistente, id: 's-2', nombre: 'Aula 102' }]);

    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('en modo edición, precarga el formulario con el salón recibido y guardar hace PATCH con su id', async () => {
    const fixture = TestBed.createComponent(SalonFormDialogComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([]);
    fixture.componentRef.setInput('salon', salonExistente);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as SalonFormDialogInternals;
    expect(component.form.getRawValue()).toEqual({
      nombre: 'Aula 101',
      bloque_id: 'b-1',
      tipo_silleteria_id: 't-1',
      cantidad_sillas: 30,
      cantidad_mesas: 1,
    });

    component.form.patchValue({ cantidad_sillas: 40 });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'PATCH', url: `${BASE_URL}/s-1` });
    expect(req.request.body).toEqual({
      nombre: 'Aula 101',
      bloque_id: 'b-1',
      tipo_silleteria_id: 't-1',
      cantidad_sillas: 40,
      cantidad_mesas: 1,
    });
    req.flush({ ...salonExistente, cantidad_sillas: 40 });
    await cederMicrotask();

    httpMock.expectOne(BASE_URL).flush([{ ...salonExistente, cantidad_sillas: 40 }]);
  });

  it('no guarda si el formulario es inválido', async () => {
    const fixture = TestBed.createComponent(SalonFormDialogComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as SalonFormDialogInternals;
    component.form.patchValue({ nombre: '' });
    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: BASE_URL });
  });
});
