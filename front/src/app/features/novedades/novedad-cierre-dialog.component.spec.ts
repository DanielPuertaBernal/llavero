import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { NotificationService } from '../../core/shared/notification.service';
import { environment } from '../../../environments/environment';
import { NovedadCierreDialogComponent } from './novedad-cierre-dialog.component';
import type { Novedad } from './novedades.models';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/novedades`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioDto = {
  id: 'us-1',
  nombre: 'Ana Vigilante',
  email_institucional: 'ana@uco.edu.co',
  oid_microsoft: null,
  rol_id: 'r-1',
  ubicacion_id: 'ub-1',
  activo: true,
};

const novedadAbierta: Novedad = {
  id: 'nv-1',
  categoria: 'dano',
  descripcion: 'Llave doblada',
  estado: 'abierta',
  solucion: null,
  registrado_por_id: 'us-1',
};

const novedadCerrada: Novedad = {
  ...novedadAbierta,
  id: 'nv-2',
  estado: 'cerrada',
  solucion: 'Se reemplazó la llave',
};

interface CierreDialogInternals {
  form: import('@angular/forms').FormGroup;
  confirmar(): void;
}

function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([novedadAbierta]);
  httpMock.expectOne(`${API}/usuarios/`).flush([usuarioDto]);
}

describe('NovedadCierreDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NovedadCierreDialogComponent],
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

  it('resume la novedad con la categoría y la descripción', async () => {
    const fixture = TestBed.createComponent(NovedadCierreDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('novedad', novedadAbierta);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Daño');
      expect(texto).toContain('Llave doblada');
      expect(texto).toContain('Ana Vigilante');
    });
  });

  it('el mensaje advierte que la acción NO se puede deshacer (no existe reabrir)', async () => {
    const fixture = TestBed.createComponent(NovedadCierreDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('novedad', novedadAbierta);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('NO se puede deshacer');
    });
  });

  it('confirmar hace POST a /{id}/cerrar con la solucion escrita y cierra el diálogo', async () => {
    const fixture = TestBed.createComponent(NovedadCierreDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('novedad', novedadAbierta);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const emitidos: number[] = [];
    fixture.componentInstance.cerrada.subscribe(() => emitidos.push(1));

    const component = fixture.componentInstance as unknown as CierreDialogInternals;
    component.form.setValue({ solucion: 'Se reemplazó la llave' });
    component.confirmar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/nv-1/cerrar` });
    expect(req.request.body).toEqual({ solucion: 'Se reemplazó la llave' });
    req.flush({ ...novedadAbierta, estado: 'cerrada', solucion: 'Se reemplazó la llave' });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([{ ...novedadAbierta, estado: 'cerrada' }]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('no ofrece confirmar sin escribir una solución (valida lo mismo que el backend)', async () => {
    const fixture = TestBed.createComponent(NovedadCierreDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('novedad', novedadAbierta);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      'button[aria-label="Confirmar cierre"]',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    const component = fixture.componentInstance as unknown as CierreDialogInternals;
    component.confirmar();
    await cederMicrotask();
    httpMock.expectNone((request) => request.url.includes('/cerrar'));
  });

  it('no ofrece confirmar una novedad ya cerrada', async () => {
    const fixture = TestBed.createComponent(NovedadCierreDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('novedad', novedadCerrada);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as CierreDialogInternals;
    component.form.setValue({ solucion: 'algo' });
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      'button[aria-label="Confirmar cierre"]',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    component.confirmar();
    await cederMicrotask();
    httpMock.expectNone((request) => request.url.includes('/cerrar'));
  });

  it('sin novedad seleccionada confirmar no llama al backend', async () => {
    const fixture = TestBed.createComponent(NovedadCierreDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as CierreDialogInternals;
    component.form.setValue({ solucion: 'algo' });
    component.confirmar();
    await cederMicrotask();

    httpMock.expectNone((request) => request.url.includes('/cerrar'));
  });

  it('muestra el mensaje del backend tal cual cuando el cierre es rechazado con 400', async () => {
    const fixture = TestBed.createComponent(NovedadCierreDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.componentRef.setInput('novedad', novedadAbierta);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    const component = fixture.componentInstance as unknown as CierreDialogInternals;
    component.form.setValue({ solucion: 'Se reemplazó la llave' });
    component.confirmar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/nv-1/cerrar` })
      .flush(
        { detail: 'La solución no puede estar vacía' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.any(String),
        'La solución no puede estar vacía',
      ),
    );
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
