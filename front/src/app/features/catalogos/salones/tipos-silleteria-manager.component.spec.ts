import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { FormGroup } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { ConfirmService } from '../../../core/shared/confirm.service';
import { environment } from '../../../../environments/environment';
import { TiposSilleteriaManagerComponent } from './tipos-silleteria-manager.component';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/tipos-silleteria`;

// Ver la nota en bloques.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP de forma asíncrona, un tick después de crear el
// componente o de invocar un método que llama `mutate*`.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

interface TiposSilleteriaManagerInternals {
  formNuevo: FormGroup<{ nombre: import('@angular/forms').FormControl<string> }>;
  agregar(): void;
  confirmarEliminar(tipo: { id: string; nombre: string }): Promise<void>;
}

describe('TiposSilleteriaManagerComponent', () => {
  let httpMock: HttpTestingController;
  let confirmService: ConfirmService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TiposSilleteriaManagerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    confirmService = TestBed.inject(ConfirmService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renderiza la lista de tipos de silletería', async () => {
    const fixture = TestBed.createComponent(TiposSilleteriaManagerComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([{ id: 't-1', nombre: 'Fija' }]);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Fija');
    });
  });

  it('agregar hace POST con el nombre del formulario', async () => {
    const fixture = TestBed.createComponent(TiposSilleteriaManagerComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as TiposSilleteriaManagerInternals;
    component.formNuevo.setValue({ nombre: 'Universitaria' });
    component.agregar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: BASE_URL });
    expect(req.request.body).toEqual({ nombre: 'Universitaria' });
    req.flush({ id: 't-2', nombre: 'Universitaria' });
    await cederMicrotask();

    // El refetch tras la invalidación (query de listado activa) también
    // hay que responderlo.
    httpMock.expectOne(BASE_URL).flush([{ id: 't-2', nombre: 'Universitaria' }]);
  });

  it('confirmarEliminar pide confirmación y, al aceptar, hace DELETE', async () => {
    const fixture = TestBed.createComponent(TiposSilleteriaManagerComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([{ id: 't-1', nombre: 'Fija' }]);
    fixture.detectChanges();

    const confirmarSpy = vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);

    const component = fixture.componentInstance as unknown as TiposSilleteriaManagerInternals;
    await component.confirmarEliminar({ id: 't-1', nombre: 'Fija' });

    expect(confirmarSpy).toHaveBeenCalledOnce();
    expect(confirmarSpy.mock.calls[0][0].mensaje).toContain('Fija');

    await cederMicrotask();

    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/t-1` })
      .flush(null, { status: 204, statusText: 'No Content' });
    await cederMicrotask();

    httpMock.expectOne(BASE_URL).flush([]);
  });
});
