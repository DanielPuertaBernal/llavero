import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { MonitorFormDialogComponent } from './monitor-form-dialog.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/monitores`;

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

const monitorDto = {
  id: 'mo-1',
  docente_titular_id: 'p-1',
  monitor_delegado_id: 'p-2',
  materia: 'Estructuras de Datos',
  aula: 'B-201',
  dia: 'lunes',
  horario: '14:00 - 16:00',
  activo: true,
};

const valoresBase = {
  docente_titular_id: 'p-1',
  monitor_delegado_id: 'p-2',
  materia: 'Estructuras de Datos',
  aula: 'B-201',
  dia: 'lunes' as const,
  horario: '14:00 - 16:00',
};

interface MonitorFormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

/** La lista de monitores más el lookup de comunidad que se disparan al inyectarse. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([docenteDto, monitorDelegadoDto]);
}

describe('MonitorFormDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitorFormDialogComponent],
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

  it('no hay modo edición: siempre crea (el backend no expone PATCH sobre monitores)', async () => {
    const fixture = TestBed.createComponent(MonitorFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nueva monitoría');
  });

  it('guardar hace POST con los campos completos de MonitorIn, cierra el diálogo y emite guardado', async () => {
    const fixture = TestBed.createComponent(MonitorFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as MonitorFormDialogInternals;
    component.form.setValue(valoresBase);
    fixture.componentInstance.visible.set(true);

    const emitidos: number[] = [];
    fixture.componentInstance.guardado.subscribe(() => emitidos.push(1));

    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual(valoresBase);
    req.flush(monitorDto);
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([monitorDto]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('omite aula, día y horario del payload cuando el operador los deja vacíos', async () => {
    const fixture = TestBed.createComponent(MonitorFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as MonitorFormDialogInternals;
    component.form.setValue({
      docente_titular_id: 'p-1',
      monitor_delegado_id: 'p-2',
      materia: 'Estructuras de Datos',
      aula: '',
      dia: null,
      horario: '',
    });
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      docente_titular_id: 'p-1',
      monitor_delegado_id: 'p-2',
      materia: 'Estructuras de Datos',
    });
    req.flush({ ...monitorDto, aula: null, dia: null, horario: null });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...monitorDto, aula: null, dia: null, horario: null }]);
  });

  it('no dispara la petición si falta un campo requerido', async () => {
    const fixture = TestBed.createComponent(MonitorFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as MonitorFormDialogInternals;
    component.form.setValue({ ...valoresBase, materia: '' });

    expect(component.form.invalid).toBe(true);
    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/` });
  });

  it('los dos selectores de persona ofrecen las mismas opciones de comunidad, con etiquetas distintas', async () => {
    const fixture = TestBed.createComponent(MonitorFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Docente titular');
    expect(fixture.nativeElement.textContent).toContain('Monitor delegado');

    await vi.waitFor(() => {
      expect(fixture.componentInstance['lookups'].opcionesPersonas()).toEqual([
        { label: 'Ana Docente (1001)', value: 'p-1' },
        { label: 'Bruno Estudiante (2002)', value: 'p-2' },
      ]);
    });
  });

  it('muestra el mensaje del backend tal cual cuando la creación es rechazada con 400 (misma persona en ambos roles)', async () => {
    const fixture = TestBed.createComponent(MonitorFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as MonitorFormDialogInternals;
    component.form.setValue({ ...valoresBase, monitor_delegado_id: 'p-1' });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush(
        { detail: 'El docente titular y el monitor delegado deben ser personas distintas' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'El docente titular y el monitor delegado deben ser personas distintas',
        }),
      ),
    );
    expect(fixture.componentInstance.visible()).toBe(true);
  });

  it('al cerrar tras crear, el formulario vuelve a sus valores por defecto', async () => {
    const fixture = TestBed.createComponent(MonitorFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as MonitorFormDialogInternals;
    component.form.setValue(valoresBase);
    component.guardar();
    await cederMicrotask();

    httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` }).flush(monitorDto);
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([monitorDto]);

    await vi.waitFor(() => {
      expect(component.form.getRawValue().materia).toBe('');
      expect(component.form.getRawValue().docente_titular_id).toBe('');
    });
  });
});
