import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { DisponibilidadVistaComponent } from './disponibilidad-vista.component';
import type { DisponibilidadService } from './disponibilidad.service';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/disponibilidad`;

// Ver la nota en disponibilidad.service.spec.ts: `injectQuery` dispara su
// lado HTTP un tick después de crear el componente o de fijar una señal.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const salonDto = {
  id: 'sa-1',
  nombre: 'Aula 201',
  bloque_id: 'bl-1',
  tipo_silleteria_id: 'ts-1',
  cantidad_sillas: 30,
  cantidad_mesas: 15,
};

const otroSalonDto = { ...salonDto, id: 'sa-2', nombre: 'Aula 305' };

interface DisponibilidadVistaInternals {
  onSalonChange(salonId: string | null): void;
  onFechaChange(fecha: Date | null): void;
  disponibilidadService: DisponibilidadService;
}

describe('DisponibilidadVistaComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // Fecha de hoy fija: `mat-datepicker` arranca con hoy por defecto (ver la
    // tarea de esta feature) y el test necesita saber cuál es "hoy" para
    // esperar la URL exacta.
    vi.setSystemTime(new Date(2026, 7, 13, 9, 0, 0));

    await TestBed.configureTestingModule({
      imports: [DisponibilidadVistaComponent],
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
    vi.useRealTimers();
  });

  it('sin salón elegido no consulta disponibilidad y muestra el mensaje de selección', async () => {
    const fixture = TestBed.createComponent(DisponibilidadVistaComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Selecciona un salón');
    });

    httpMock.expectNone((req) => req.url.startsWith(`${BASE_URL}/salon/`));
  });

  it('al elegir un salón consulta con la fecha de hoy por defecto y resalta el conflicto', async () => {
    const fixture = TestBed.createComponent(DisponibilidadVistaComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    const component = fixture.componentInstance as unknown as DisponibilidadVistaInternals;
    component.onSalonChange('sa-1');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-08-13`).flush({
      salon_id: 'sa-1',
      dia: 'jueves',
      fecha: '2026-08-13',
      ocupaciones: [
        {
          origen: 'programacion',
          id: 'oc-1',
          recurrente: true,
          dia_semana: 'jueves',
          fecha: null,
          hora_inicio: '08:00:00',
          hora_fin: '10:00:00',
          titulo: 'Cálculo I',
          responsable_id: 'r-1',
          estado: null,
        },
        {
          origen: 'reserva_individual',
          id: 'oc-2',
          recurrente: false,
          dia_semana: null,
          fecha: '2026-08-13',
          hora_inicio: '09:00:00',
          hora_fin: '11:00:00',
          titulo: 'Asesoría de tesis',
          responsable_id: 'r-2',
          estado: 'aprobada',
        },
      ],
      conflictos: [{ ocupacion_a_id: 'oc-1', ocupacion_b_id: 'oc-2' }],
    });

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Cálculo I');
      expect(texto).toContain('Asesoría de tesis');
      expect(texto).toContain('08:00');
      expect(texto).toContain('09:00');
    });

    // Las dos ocupaciones en conflicto quedan marcadas visualmente.
    const filas = fixture.nativeElement.querySelectorAll('[data-testid="ocupacion"]');
    expect(filas.length).toBe(2);
    expect(filas[0].getAttribute('data-conflicto')).toBe('true');
    expect(filas[1].getAttribute('data-conflicto')).toBe('true');
  });

  it('estado vacío: sin ocupaciones ese día muestra un mensaje claro', async () => {
    const fixture = TestBed.createComponent(DisponibilidadVistaComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    const component = fixture.componentInstance as unknown as DisponibilidadVistaInternals;
    component.onSalonChange('sa-1');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-08-13`).flush({
      salon_id: 'sa-1',
      dia: 'jueves',
      fecha: '2026-08-13',
      ocupaciones: [],
      conflictos: [],
    });

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No hay ocupaciones');
    });
  });

  it('muestra un mensaje de error claro si el backend devuelve 400', async () => {
    const fixture = TestBed.createComponent(DisponibilidadVistaComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    const component = fixture.componentInstance as unknown as DisponibilidadVistaInternals;
    component.onSalonChange('sa-1');
    await cederMicrotask();

    httpMock
      .expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-08-13`)
      .flush({ detail: 'El salón no existe' }, { status: 400, statusText: 'Bad Request' });

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('El salón no existe');
    });
  });

  it('reacciona a un cambio de salón consultando su disponibilidad', async () => {
    const fixture = TestBed.createComponent(DisponibilidadVistaComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto, otroSalonDto]);

    const component = fixture.componentInstance as unknown as DisponibilidadVistaInternals;
    component.onSalonChange('sa-1');
    await cederMicrotask();
    httpMock
      .expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-08-13`)
      .flush({ salon_id: 'sa-1', dia: 'jueves', fecha: '2026-08-13', ocupaciones: [], conflictos: [] });

    component.onSalonChange('sa-2');
    await cederMicrotask();
    httpMock
      .expectOne(`${BASE_URL}/salon/sa-2?fecha=2026-08-13`)
      .flush({ salon_id: 'sa-2', dia: 'jueves', fecha: '2026-08-13', ocupaciones: [], conflictos: [] });

    expect(component.disponibilidadService.salonId()).toBe('sa-2');
  });

  it('reacciona a un cambio de fecha consultando la nueva fecha', async () => {
    const fixture = TestBed.createComponent(DisponibilidadVistaComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${API}/catalogos/salones`).flush([salonDto]);

    const component = fixture.componentInstance as unknown as DisponibilidadVistaInternals;
    component.onSalonChange('sa-1');
    await cederMicrotask();
    httpMock
      .expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-08-13`)
      .flush({ salon_id: 'sa-1', dia: 'jueves', fecha: '2026-08-13', ocupaciones: [], conflictos: [] });

    component.onFechaChange(new Date(2026, 7, 20, 9, 0, 0));
    await cederMicrotask();

    httpMock
      .expectOne(`${BASE_URL}/salon/sa-1?fecha=2026-08-20`)
      .flush({ salon_id: 'sa-1', dia: 'jueves', fecha: '2026-08-20', ocupaciones: [], conflictos: [] });

    expect(component.disponibilidadService.fecha()).toBe('2026-08-20');
  });
});
