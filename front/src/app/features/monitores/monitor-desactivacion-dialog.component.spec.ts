import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { MonitorDesactivacionDialogComponent } from './monitor-desactivacion-dialog.component';
import type { Monitor } from './monitores.models';

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

const monitoriaActiva: Monitor = {
  id: 'mo-1',
  docente_titular_id: 'p-1',
  monitor_delegado_id: 'p-2',
  materia: 'Estructuras de Datos',
  aula: 'B-201',
  dia: 'lunes',
  horario: '14:00 - 16:00',
  activo: true,
};

const monitoriaInactiva: Monitor = { ...monitoriaActiva, id: 'mo-2', activo: false };

interface DesactivacionDialogInternals {
  confirmar(): void;
}

/** El diálogo inyecta `MonitoresService` + `MonitoresLookupsService`: 2 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([monitoriaActiva]);
  httpMock.expectOne(`${API}/comunidad/`).flush([docenteDto, monitorDelegadoDto]);
}

describe('MonitorDesactivacionDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitorDesactivacionDialogComponent],
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

  it('resume la monitoría con nombres legibles', async () => {
    const fixture = TestBed.createComponent(MonitorDesactivacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('monitor', monitoriaActiva);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Ana Docente');
      expect(texto).toContain('Bruno Estudiante');
      expect(texto).toContain('Estructuras de Datos');
    });
  });

  it('el mensaje advierte que la acción NO se puede deshacer (no existe reactivar)', async () => {
    const fixture = TestBed.createComponent(MonitorDesactivacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('monitor', monitoriaActiva);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('NO se puede deshacer');
    });
  });

  it('confirmar hace POST a /{id}/desactivar sin cuerpo y cierra el diálogo', async () => {
    const fixture = TestBed.createComponent(MonitorDesactivacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('monitor', monitoriaActiva);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const emitidos: number[] = [];
    fixture.componentInstance.desactivada.subscribe(() => emitidos.push(1));

    const component = fixture.componentInstance as unknown as DesactivacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/mo-1/desactivar` });
    expect(req.request.body).toBeNull();
    req.flush({ ...monitoriaActiva, activo: false });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...monitoriaActiva, activo: false }]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('sin monitoría seleccionada confirmar no llama al backend', async () => {
    const fixture = TestBed.createComponent(MonitorDesactivacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as DesactivacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    httpMock.expectNone((request) => request.url.includes('/desactivar'));
  });

  it('no ofrece confirmar una monitoría ya inactiva', async () => {
    const fixture = TestBed.createComponent(MonitorDesactivacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('monitor', monitoriaInactiva);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      'button[aria-label="Confirmar desactivación"]',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    const component = fixture.componentInstance as unknown as DesactivacionDialogInternals;
    component.confirmar();
    await cederMicrotask();
    httpMock.expectNone((request) => request.url.includes('/desactivar'));
  });

  it('muestra el mensaje del backend tal cual cuando la desactivación es rechazada con 404', async () => {
    const fixture = TestBed.createComponent(MonitorDesactivacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('monitor', monitoriaActiva);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as DesactivacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/mo-1/desactivar` })
      .flush({ detail: 'Monitor no encontrado' }, { status: 404, statusText: 'Not Found' });

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Monitor no encontrado',
        }),
      ),
    );
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
