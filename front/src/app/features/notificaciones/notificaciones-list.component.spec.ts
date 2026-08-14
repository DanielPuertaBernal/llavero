import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { AuthService } from '../../core/auth/auth.service';
import type { UsuarioAutenticado } from '../../core/auth/auth.models';
import { environment } from '../../../environments/environment';
import { NotificacionesListComponent } from './notificaciones-list.component';
import type { NotificacionesService } from './notificaciones.service';
import type {
  EstadoEnvioNotificacion,
  Notificacion,
  TipoNotificacion,
} from './notificaciones.models';
import type { NotificacionPrecarga } from './notificacion-form-dialog.component';

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

const personaDto = {
  id: 'p-1',
  numero_documento: '1001',
  nombre: 'Ana Docente',
  tipo_persona_id: 'tp-1',
  id_carnet: null,
  correo: 'ana@uco.edu.co',
  numero_contacto: null,
  facultad: null,
};

const notificacionEnviada: Notificacion = {
  id: 'no-1',
  destinatario_id: 'p-1',
  tipo: 'manual',
  asunto: 'Aviso de préstamo',
  mensaje: 'Recuerda devolver la llave.',
  estado_envio: 'enviado',
  enviado_por_id: 'us-yo',
};

const notificacionFallida: Notificacion = {
  id: 'no-2',
  destinatario_id: 'p-1',
  tipo: 'recordatorio',
  asunto: null,
  mensaje: 'Tienes una llave vencida.',
  estado_envio: 'fallido',
  enviado_por_id: null,
};

interface NotificacionesListInternals {
  onTipoChange(tipo: TipoNotificacion | null): void;
  onEstadoEnvioChange(estado: EstadoEnvioNotificacion | null): void;
  formDialogVisible: import('@angular/core').WritableSignal<boolean>;
  dialogModo: import('@angular/core').WritableSignal<'manual' | 'recordatorio'>;
  notificacionAReenviar: import('@angular/core').WritableSignal<NotificacionPrecarga | null>;
  abrirEnvioManual(): void;
  abrirRecordatorio(): void;
  abrirReenvio(notificacion: Notificacion): void;
  notificacionesService: NotificacionesService;
}

function responderLookups(httpMock: HttpTestingController): void {
  httpMock.expectOne(`${API}/comunidad/`).flush([personaDto]);
}

describe('NotificacionesListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    const currentUser = signal<UsuarioAutenticado | null>(usuarioAutenticado);

    await TestBed.configureTestingModule({
      imports: [NotificacionesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: AuthService, useValue: { currentUser } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('resuelve destinatario a nombre legible y muestra tipo, asunto, mensaje y estado de envío', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionEnviada]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Ana Docente');
      expect(texto).toContain('Manual');
      expect(texto).toContain('Aviso de préstamo');
      expect(texto).toContain('Recuerda devolver la llave.');
      expect(texto).toContain('Enviado');
    });
  });

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE_URL}/`)
      .flush({ detail: 'error' }, { status: 500, statusText: 'Server Error' });
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        'No se pudieron cargar las notificaciones',
      );
    });
  });

  it('el filtro de tipo consulta al SERVIDOR su endpoint propio', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionEnviada, notificacionFallida]);
    responderLookups(httpMock);

    const component = fixture.componentInstance as unknown as NotificacionesListInternals;
    component.onTipoChange('recordatorio');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/tipo/recordatorio`).flush([notificacionFallida]);

    component.onTipoChange(null);
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionEnviada, notificacionFallida]);
  });

  it('el filtro de estado de envío consulta al SERVIDOR su endpoint propio', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionEnviada, notificacionFallida]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    });

    const component = fixture.componentInstance as unknown as NotificacionesListInternals;
    component.onEstadoEnvioChange('fallido');
    await cederMicrotask();

    httpMock.expectOne(`${BASE_URL}/estado-envio/fallido`).flush([notificacionFallida]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
      expect(fixture.nativeElement.textContent).toContain('Fallido');
    });
  });

  it('elegir un tipo limpia el filtro de estado de envío, y viceversa (mutuamente excluyentes)', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionEnviada, notificacionFallida]);
    responderLookups(httpMock);
    await cederMicrotask();

    const component = fixture.componentInstance as unknown as NotificacionesListInternals;

    component.onEstadoEnvioChange('fallido');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/estado-envio/fallido`).flush([notificacionFallida]);

    component.onTipoChange('recordatorio');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/tipo/recordatorio`).flush([notificacionFallida]);
    expect(component.notificacionesService.filtroEstadoEnvio()).toBeNull();

    component.onEstadoEnvioChange('fallido');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/estado-envio/fallido`).flush([notificacionFallida]);
    expect(component.notificacionesService.filtroTipo()).toBeNull();
  });

  it('"Reenviar" solo aparece en filas fallidas y abre el diálogo prellenado en modo manual', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionEnviada, notificacionFallida]);
    responderLookups(httpMock);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('button[aria-label="Reenviar notificación"]')
          .length,
      ).toBe(1);
    });

    const component = fixture.componentInstance as unknown as NotificacionesListInternals;
    component.abrirReenvio(notificacionFallida);

    expect(component.formDialogVisible()).toBe(true);
    expect(component.dialogModo()).toBe('manual');
    expect(component.notificacionAReenviar()).toEqual({
      destinatario_id: 'p-1',
      asunto: '',
      mensaje: 'Tienes una llave vencida.',
    });
  });

  it('"Enviar notificación" abre el diálogo en modo manual sin precarga', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    responderLookups(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as NotificacionesListInternals;
    component.abrirEnvioManual();

    expect(component.formDialogVisible()).toBe(true);
    expect(component.dialogModo()).toBe('manual');
    expect(component.notificacionAReenviar()).toBeNull();
  });

  it('"Enviar recordatorio" abre el diálogo en modo recordatorio sin precarga', async () => {
    const fixture = TestBed.createComponent(NotificacionesListComponent);
    await cederMicrotask();
    fixture.detectChanges();
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    responderLookups(httpMock);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as NotificacionesListInternals;
    component.abrirRecordatorio();

    expect(component.formDialogVisible()).toBe(true);
    expect(component.dialogModo()).toBe('recordatorio');
    expect(component.notificacionAReenviar()).toBeNull();
  });
});
