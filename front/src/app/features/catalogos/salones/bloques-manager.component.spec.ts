import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { FormGroup } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { ConfirmService } from '../../../core/shared/confirm.service';
import { environment } from '../../../../environments/environment';
import { BloquesManagerComponent } from './bloques-manager.component';

const BASE_URL = `${environment.apiBaseUrl}/catalogos/bloques`;

// Ver la nota en bloques.service.spec.ts: `injectQuery`/`injectMutation`
// disparan su lado HTTP de forma asíncrona, un tick después de crear el
// componente o de invocar un método que llama `mutate*`.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

// Los métodos/formularios del componente son `protected` (solo el template
// necesita verlos) — este helper castea al shape mínimo que los specs
// necesitan invocar directamente, en vez de simular toda la interacción
// DOM de widgets PrimeNG con overlay (fuera de alcance de un test unitario
// de este componente).
interface BloquesManagerInternals {
  formNuevo: FormGroup<{ nombre: import('@angular/forms').FormControl<string> }>;
  agregar(): void;
  confirmarEliminar(bloque: { id: string; nombre: string }): Promise<void>;
}

describe('BloquesManagerComponent', () => {
  let httpMock: HttpTestingController;
  let confirmService: ConfirmService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BloquesManagerComponent],
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

  it('renderiza la lista de bloques obtenida del backend', async () => {
    const fixture = TestBed.createComponent(BloquesManagerComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([{ id: 'b-1', nombre: 'Bloque A' }]);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Bloque A');
    });
  });

  it('agregar hace POST con el nombre del formulario y refleja el bloque creado', async () => {
    const fixture = TestBed.createComponent(BloquesManagerComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as BloquesManagerInternals;
    component.formNuevo.setValue({ nombre: 'Bloque Nuevo' });
    component.agregar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: BASE_URL });
    expect(req.request.body).toEqual({ nombre: 'Bloque Nuevo' });
    req.flush({ id: 'b-2', nombre: 'Bloque Nuevo' });
    await cederMicrotask();

    // El `onSuccess` de la mutación invalida la queryKey de bloques, y como
    // la query de listado sigue "activa" (montada en este mismo
    // componente), TanStack Query dispara un refetch real — hay que
    // responderlo para no dejar una request abierta.
    httpMock.expectOne(BASE_URL).flush([{ id: 'b-2', nombre: 'Bloque Nuevo' }]);

    await vi.waitFor(() => expect(component.formNuevo.getRawValue().nombre).toBe(''));
  });

  it('confirmarEliminar pide confirmación y, al aceptar, hace DELETE', async () => {
    const fixture = TestBed.createComponent(BloquesManagerComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([{ id: 'b-1', nombre: 'Bloque A' }]);
    fixture.detectChanges();

    const confirmarSpy = vi.spyOn(confirmService, 'confirmar').mockResolvedValue(true);

    const component = fixture.componentInstance as unknown as BloquesManagerInternals;
    await component.confirmarEliminar({ id: 'b-1', nombre: 'Bloque A' });

    expect(confirmarSpy).toHaveBeenCalledOnce();
    expect(confirmarSpy.mock.calls[0][0].mensaje).toContain('Bloque A');

    await cederMicrotask();

    httpMock
      .expectOne({ method: 'DELETE', url: `${BASE_URL}/b-1` })
      .flush(null, { status: 204, statusText: 'No Content' });
    await cederMicrotask();

    // Ver la nota en el test de `agregar`: el refetch tras invalidar
    // también hay que responderlo acá.
    httpMock.expectOne(BASE_URL).flush([]);
  });

  it('no hace DELETE si el usuario no confirma', async () => {
    const fixture = TestBed.createComponent(BloquesManagerComponent);
    await cederMicrotask();
    httpMock.expectOne(BASE_URL).flush([{ id: 'b-1', nombre: 'Bloque A' }]);
    fixture.detectChanges();

    vi.spyOn(confirmService, 'confirmar').mockResolvedValue(false);

    const component = fixture.componentInstance as unknown as BloquesManagerInternals;
    await component.confirmarEliminar({ id: 'b-1', nombre: 'Bloque A' });
    await cederMicrotask();

    httpMock.expectNone({ method: 'DELETE', url: `${BASE_URL}/b-1` });
  });
});
