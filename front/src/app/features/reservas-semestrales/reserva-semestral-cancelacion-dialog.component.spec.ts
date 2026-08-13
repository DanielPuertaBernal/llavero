import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { ReservaSemestralCancelacionDialogComponent } from './reserva-semestral-cancelacion-dialog.component';
import type { ReservaSemestral } from './reservas-semestrales.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/reservas-semestrales`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const personaDto = {
  id: 'p-1',
  numero_documento: '1001',
  nombre: 'Ana Docente',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: null,
  numero_contacto: null,
  facultad: null,
};

const salonDto = {
  id: 'sa-1',
  nombre: 'Aula 201',
  bloque_id: 'bl-1',
  tipo_silleteria_id: 'ts-1',
  cantidad_sillas: 30,
  cantidad_mesas: 15,
};

const semestreDto = {
  id: 'sem-1',
  codigo: '2026-2',
  fecha_inicio: '2026-08-03',
  fecha_fin: '2026-12-05',
};

const franjaLunes: ReservaSemestral = {
  id: 'rs-1',
  salon_id: 'sa-1',
  solicitante_id: 'p-1',
  semestre_id: 'sem-1',
  dia: 'lunes',
  hora_inicio: '08:00:00',
  hora_fin: '10:00:00',
  grupo_id: 'g-1',
  creado_manualmente: true,
};

const franjaMiercoles: ReservaSemestral = { ...franjaLunes, id: 'rs-2', dia: 'miercoles' };

const franjaInstitucional: ReservaSemestral = { ...franjaLunes, creado_manualmente: false };

interface CancelacionDialogInternals {
  confirmar(): void;
}

/** El diálogo inyecta `ReservasSemestralesService` + `ReservasSemestralesLookupsService`: 4 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([franjaLunes, franjaMiercoles]);
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
  httpMock.expectOne(`${API}/programacion/semestres`).flush([semestreDto]);
}

describe('ReservaSemestralCancelacionDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservaSemestralCancelacionDialogComponent],
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

  it('resume el grupo con nombres legibles y cuántas franjas se van a eliminar', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('franjas', [franjaLunes, franjaMiercoles]);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Aula 201');
      expect(texto).toContain('Ana Docente');
      expect(texto).toContain('2026-2');
      expect(texto).toContain('Lunes');
      expect(texto).toContain('Miércoles');
      // 2 franjas del grupo, dicho explícitamente.
      expect(texto).toContain('2');
    });
  });

  it('confirmar hace POST a /grupo/{grupoId}/cancelar y cierra el diálogo', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('franjas', [franjaLunes, franjaMiercoles]);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const emitidos: number[] = [];
    fixture.componentInstance.cancelada.subscribe(() => emitidos.push(1));

    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/grupo/g-1/cancelar` });
    expect(req.request.body).toBeNull();
    req.flush({ eliminadas: 2 });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['reservas-semestrales']`.
    httpMock.expectOne(`${BASE_URL}/`).flush([]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('sin franjas seleccionadas confirmar no llama al backend', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    httpMock.expectNone((request) => request.url.includes('/cancelar'));
  });

  it('no ofrece confirmar un grupo con alguna franja cargada institucionalmente', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('franjas', [franjaLunes, franjaInstitucional]);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('institucional');
    });

    const boton = fixture.nativeElement.querySelector(
      'button[aria-label="Confirmar cancelación"]',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();
    httpMock.expectNone((request) => request.url.includes('/cancelar'));
  });

  it('muestra el mensaje del backend tal cual cuando la cancelación es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(ReservaSemestralCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('franjas', [franjaLunes]);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/grupo/g-1/cancelar` }).flush(
      { detail: 'No se puede cancelar un grupo con franjas cargadas institucionalmente' },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: expect.stringContaining('No se puede cancelar un grupo'),
        }),
      ),
    );
    // El diálogo NO se cierra ante un error.
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
