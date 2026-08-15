import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { NotificationService } from '../../core/shared/notification.service';
import { ReservaCancelacionDialogComponent } from './reserva-cancelacion-dialog.component';
import type { Reserva } from './reservas.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/reservas`;

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

const reservaAprobada: Reserva = {
  id: 'rv-1',
  salon_id: 'sa-1',
  solicitante_id: 'p-1',
  fecha: '2026-08-20',
  hora_inicio: '08:00:00',
  hora_fin: '10:00:00',
  motivo: 'Asesoría de tesis',
  estado: 'aprobada',
};

const reservaCompletada: Reserva = { ...reservaAprobada, id: 'rv-2', estado: 'completada' };

interface CancelacionDialogInternals {
  confirmar(): void;
}

/** El diálogo inyecta `ReservasService` + `ReservasLookupsService`: 3 consultas. */
function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([reservaAprobada]);
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
  httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);
}

describe('ReservaCancelacionDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservaCancelacionDialogComponent],
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

  it('resume la reserva con nombres legibles y la fecha de calendario sin desplazar', async () => {
    const fixture = TestBed.createComponent(ReservaCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('reserva', reservaAprobada);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Aula 201');
      expect(texto).toContain('Ana Docente');
      // 20/08, no 19/08: la fecha se reformatea como texto, sin pasar por
      // `Date` (que la leería como medianoche UTC).
      expect(texto).toContain('20/08/2026');
      expect(texto).toContain('08:00');
      expect(texto).toContain('10:00');
      expect(texto).toContain('Asesoría de tesis');
    });
  });

  it('confirmar hace POST a /{id}/cancelar y cierra el diálogo', async () => {
    const fixture = TestBed.createComponent(ReservaCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('reserva', reservaAprobada);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const emitidos: number[] = [];
    fixture.componentInstance.cancelada.subscribe(() => emitidos.push(1));

    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/rv-1/cancelar` });
    expect(req.request.body).toBeNull();
    req.flush({ ...reservaAprobada, estado: 'cancelada' });
    await cederMicrotask();

    // Refetch tras invalidar el prefijo `['reservas']`.
    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...reservaAprobada, estado: 'cancelada' }]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('sin reserva seleccionada confirmar no llama al backend', async () => {
    const fixture = TestBed.createComponent(ReservaCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    httpMock.expectNone((request) => request.url.includes('/cancelar'));
  });

  it('no ofrece confirmar una reserva que ya no está aprobada', async () => {
    const fixture = TestBed.createComponent(ReservaCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('reserva', reservaCompletada);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Completada');
    });

    const boton = fixture.nativeElement.querySelector(
      'button[aria-label="Confirmar cancelación"]',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    // Y aunque se invoque el método igual, no sale petición: el estado es la
    // guarda, no solo el atributo del botón.
    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();
    httpMock.expectNone((request) => request.url.includes('/cancelar'));
  });

  it('muestra el mensaje del backend tal cual cuando la cancelación es rechazada con 400', async () => {
    const fixture = TestBed.createComponent(ReservaCancelacionDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('reserva', reservaAprobada);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    const component = fixture.componentInstance as unknown as CancelacionDialogInternals;
    component.confirmar();
    await cederMicrotask();

    httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/rv-1/cancelar` }).flush(
      {
        detail:
          "No se puede cancelar una reserva en estado 'completada' (solo se puede cancelar una reserva 'aprobada')",
      },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'No se pudo cancelar la reserva',
        expect.stringContaining('No se puede cancelar una reserva en estado'),
      ),
    );
    // El diálogo NO se cierra ante un error.
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
