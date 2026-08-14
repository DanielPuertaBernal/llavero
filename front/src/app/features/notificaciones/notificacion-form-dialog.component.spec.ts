import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { AuthService } from '../../core/auth/auth.service';
import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { environment } from '../../../environments/environment';
import { NotificacionFormDialogComponent } from './notificacion-form-dialog.component';

const API = environment.apiBaseUrl;
const BASE_URL = `${API}/notificaciones`;

const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const usuarioAutenticado: UsuarioAutenticado = {
  id: 'us-yo',
  nombre: 'Carla Operadora',
  emailInstitucional: 'carla@uco.edu.co',
  rolId: 'r-1',
  ubicacionId: 'ub-1',
};

const notificacionDto = {
  id: 'no-1',
  destinatario_id: 'p-1',
  tipo: 'manual',
  asunto: 'Aviso',
  mensaje: 'Mensaje',
  estado_envio: 'enviado',
  enviado_por_id: 'us-yo',
};

interface FormDialogInternals {
  form: import('@angular/forms').FormGroup;
  guardar(): void;
}

function responderCargaInicial(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${BASE_URL}/`).flush([]);
  httpMock.expectOne(`${API}/comunidad/`).flush([]);
}

describe('NotificacionFormDialogComponent', () => {
  let httpMock: HttpTestingController;
  let currentUser: ReturnType<typeof signal<UsuarioAutenticado | null>>;

  beforeEach(async () => {
    currentUser = signal<UsuarioAutenticado | null>(usuarioAutenticado);

    await TestBed.configureTestingModule({
      imports: [NotificacionFormDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        MessageService,
        { provide: AuthService, useValue: { currentUser } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('en modo manual, con el formulario vacío es inválido y no sale ninguna petición', async () => {
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    expect(component.form.invalid).toBe(true);

    component.guardar();
    await cederMicrotask();
    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/manual` });
  });

  it('en modo manual, envía POST /manual con enviado_por_id tomado de AuthService.currentUser()', async () => {
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({ destinatario_id: 'p-1', asunto: 'Aviso', mensaje: 'Mensaje' });

    const emitidos: number[] = [];
    fixture.componentInstance.enviado.subscribe(() => emitidos.push(1));
    fixture.componentInstance.visible.set(true);

    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/manual` });
    expect(req.request.body).toEqual({
      destinatario_id: 'p-1',
      asunto: 'Aviso',
      mensaje: 'Mensaje',
      enviado_por_id: 'us-yo',
    });
    req.flush(notificacionDto, { status: 201, statusText: 'Created' });
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionDto]);

    await vi.waitFor(() => {
      expect(fixture.componentInstance.visible()).toBe(false);
      expect(emitidos.length).toBe(1);
    });
  });

  it('en modo manual, sin sesión activa no envía nada y avisa por toast', async () => {
    currentUser.set(null);
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({ destinatario_id: 'p-1', asunto: 'Aviso', mensaje: 'Mensaje' });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock.expectNone({ method: 'POST', url: `${BASE_URL}/manual` });
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: expect.stringContaining('sesión') }),
    );
  });

  it('en modo manual, muestra el 400 del backend tal cual y no cierra el diálogo', async () => {
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({ destinatario_id: 'p-9', asunto: 'Aviso', mensaje: 'Mensaje' });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/manual` })
      .flush(
        { detail: 'No existe un destinatario en comunidad con id p-9' },
        { status: 400, statusText: 'Bad Request' },
      );

    await vi.waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: expect.stringContaining('No existe un destinatario'),
        }),
      ),
    );
    expect(fixture.componentInstance.visible()).toBe(true);
  });

  it('en modo recordatorio, el asunto no es requerido y el mensaje es opcional', async () => {
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    fixture.componentRef.setInput('modo', 'recordatorio');
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.controls['destinatario_id'].setValue('p-1');
    expect(component.form.valid).toBe(true);

    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/recordatorio` });
    // Sin mensaje escrito por el operador, la clave ni siquiera viaja: el
    // backend aplica su propia plantilla.
    expect(req.request.body).toEqual({ destinatario_id: 'p-1' });
    req.flush(
      { ...notificacionDto, tipo: 'recordatorio', asunto: null, enviado_por_id: null },
      { status: 201, statusText: 'Created' },
    );
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);

    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('en modo recordatorio, si se escribe un mensaje sí viaja en el cuerpo', async () => {
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    fixture.componentRef.setInput('modo', 'recordatorio');
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.form.setValue({
      destinatario_id: 'p-1',
      asunto: '',
      mensaje: 'Recuerda devolver la llave hoy.',
    });
    fixture.componentInstance.visible.set(true);
    component.guardar();
    await cederMicrotask();

    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/recordatorio` });
    expect(req.request.body).toEqual({
      destinatario_id: 'p-1',
      mensaje: 'Recuerda devolver la llave hoy.',
    });
    req.flush(
      { ...notificacionDto, tipo: 'recordatorio', asunto: null, enviado_por_id: null },
      { status: 201, statusText: 'Created' },
    );
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });

  it('con `precarga` presente y el diálogo visible, parchea destinatario/asunto/mensaje (caso "Reenviar")', async () => {
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    fixture.componentRef.setInput('precarga', {
      destinatario_id: 'p-1',
      asunto: 'Aviso original',
      mensaje: 'Mensaje original',
    });
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();

    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    expect(component.form.getRawValue()).toEqual({
      destinatario_id: 'p-1',
      asunto: 'Aviso original',
      mensaje: 'Mensaje original',
    });
  });

  it('"Reenviar" dispara POST /manual (una fila NUEVA), nunca muta la notificación fallida', async () => {
    const fixture = TestBed.createComponent(NotificacionFormDialogComponent);
    fixture.componentRef.setInput('precarga', {
      destinatario_id: 'p-1',
      asunto: 'Aviso original',
      mensaje: 'Mensaje original',
    });
    await cederMicrotask();
    responderCargaInicial(httpMock);
    fixture.detectChanges();
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as FormDialogInternals;
    component.guardar();
    await cederMicrotask();

    // Nunca un PATCH/PUT a una notificación puntual: el backend no lo
    // expone, así que reenviar es un POST /manual normal.
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/manual` });
    expect(req.request.body).toEqual({
      destinatario_id: 'p-1',
      asunto: 'Aviso original',
      mensaje: 'Mensaje original',
      enviado_por_id: 'us-yo',
    });
    req.flush(notificacionDto, { status: 201, statusText: 'Created' });
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionDto]);
    await vi.waitFor(() => expect(fixture.componentInstance.visible()).toBe(false));
  });
});
