import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { MonitorClasesDocenteComponent } from './monitor-clases-docente.component';

const BASE_URL = `${environment.apiBaseUrl}/monitores`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const claseDto = {
  id: 'pr-1',
  salon_id: 'sa-1',
  semestre_id: 'se-1',
  dia: 'lunes',
  hora_inicio: '08:00:00',
  hora_fin: '10:00:00',
  materia: 'Estructuras de Datos',
};

describe('MonitorClasesDocenteComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitorClasesDocenteComponent],
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

  it('consulta GET /api/monitores/{id}/clases-docente-titular con el id de la fila expandida', async () => {
    const fixture = TestBed.createComponent(MonitorClasesDocenteComponent);
    fixture.componentRef.setInput('monitorId', 'mo-1');
    fixture.detectChanges();
    await cederMicrotask();

    const req = httpMock.expectOne(`${BASE_URL}/mo-1/clases-docente-titular`);
    req.flush([claseDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Estructuras de Datos');
    });
    expect(fixture.nativeElement.textContent).toContain('08:00');
    expect(fixture.nativeElement.textContent).toContain('10:00');
  });

  it('muestra un mensaje cuando el docente titular no tiene clases programadas', async () => {
    const fixture = TestBed.createComponent(MonitorClasesDocenteComponent);
    fixture.componentRef.setInput('monitorId', 'mo-1');
    fixture.detectChanges();
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/mo-1/clases-docente-titular`).flush([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('no tiene clases programadas');
    });
  });

  it('muestra un mensaje de error si la consulta falla', async () => {
    const fixture = TestBed.createComponent(MonitorClasesDocenteComponent);
    fixture.componentRef.setInput('monitorId', 'mo-1');
    fixture.detectChanges();
    await cederMicrotask();

    httpMock
      .expectOne(`${BASE_URL}/mo-1/clases-docente-titular`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las clases');
    });
  });
});
