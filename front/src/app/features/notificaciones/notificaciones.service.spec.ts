import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { notificacionesQueryKeys } from './notificaciones-query-keys';
import { NotificacionesService } from './notificaciones.service';

const BASE_URL = `${environment.apiBaseUrl}/notificaciones`;

// Ver la misma nota en reservas (reservas.service.spec.ts): `injectQuery`/
// `injectMutation` disparan su lado HTTP de forma asíncrona.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const notificacionDto = {
  id: 'no-1',
  destinatario_id: 'p-1',
  tipo: 'manual',
  asunto: 'Aviso de préstamo',
  mensaje: 'Recuerda devolver la llave.',
  estado_envio: 'enviado',
  enviado_por_id: 'u-1',
};

describe('NotificacionesService', () => {
  let service: NotificacionesService;
  let httpMock: HttpTestingController;
  let queryClient: QueryClient;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      ],
    });
    queryClient = TestBed.inject(QueryClient);
    service = TestBed.inject(NotificacionesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sin filtros consulta la lista completa (GET /api/notificaciones/)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionDto]);

    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([notificacionDto]));
  });

  it('al fijar el filtro de tipo consulta su endpoint bajo su propia clave', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionDto]);
    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([notificacionDto]));

    service.filtroTipo.set('recordatorio');
    await cederMicrotask();

    const recordatorio = { ...notificacionDto, id: 'no-2', tipo: 'recordatorio' };
    httpMock.expectOne(`${BASE_URL}/tipo/recordatorio`).flush([recordatorio]);

    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([recordatorio]));
    // La lista sin filtro sigue cacheada aparte: son dos claves distintas.
    expect(queryClient.getQueryData(notificacionesQueryKeys.lista)).toEqual([notificacionDto]);
    expect(queryClient.getQueryData(notificacionesQueryKeys.porTipo('recordatorio'))).toEqual([
      recordatorio,
    ]);
  });

  it('al fijar el filtro de estado de envío consulta su endpoint bajo su propia clave', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionDto]);
    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([notificacionDto]));

    service.filtroEstadoEnvio.set('fallido');
    await cederMicrotask();

    const fallida = { ...notificacionDto, id: 'no-3', estado_envio: 'fallido' };
    httpMock.expectOne(`${BASE_URL}/estado-envio/fallido`).flush([fallida]);

    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([fallida]));
    expect(
      queryClient.getQueryData(notificacionesQueryKeys.porEstadoEnvio('fallido')),
    ).toEqual([fallida]);
  });

  it('con filtroTipo y filtroEstadoEnvio fijados a la vez, filtroEstadoEnvio tiene precedencia', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([notificacionDto]);
    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([notificacionDto]));

    service.filtroTipo.set('recordatorio');
    await cederMicrotask();
    httpMock.expectOne(`${BASE_URL}/tipo/recordatorio`).flush([notificacionDto]);
    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([notificacionDto]));

    service.filtroEstadoEnvio.set('fallido');
    await cederMicrotask();

    const fallida = { ...notificacionDto, id: 'no-3', estado_envio: 'fallido' };
    httpMock.expectOne(`${BASE_URL}/estado-envio/fallido`).flush([fallida]);

    await vi.waitFor(() => expect(service.notificaciones.data()).toEqual([fallida]));
  });

  it('enviarManual hace POST a /manual con el cuerpo tal cual e invalida el prefijo ["notificaciones"]', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.enviarManual.mutateAsync({
      destinatario_id: 'p-1',
      asunto: 'Aviso de préstamo',
      mensaje: 'Recuerda devolver la llave.',
      enviado_por_id: 'u-1',
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/manual` });
    expect(req.request.body).toEqual({
      destinatario_id: 'p-1',
      asunto: 'Aviso de préstamo',
      mensaje: 'Recuerda devolver la llave.',
      enviado_por_id: 'u-1',
    });
    req.flush(notificacionDto, { status: 201, statusText: 'Created' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: notificacionesQueryKeys.raiz });
  });

  it('enviarManual propaga el 400 del backend (ej. destinatario inexistente)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.enviarManual.mutateAsync({
      destinatario_id: 'p-9',
      asunto: 'Aviso',
      mensaje: 'Mensaje',
      enviado_por_id: 'u-1',
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/manual` })
      .flush(
        { detail: 'No existe un destinatario en comunidad con id p-9' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });

  it('enviarRecordatorio hace POST a /recordatorio y OMITE mensaje si no se pasa', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.enviarRecordatorio.mutateAsync({ destinatario_id: 'p-1' });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/recordatorio` });
    expect(req.request.body).toEqual({ destinatario_id: 'p-1' });
    req.flush(
      { ...notificacionDto, id: 'no-4', tipo: 'recordatorio', asunto: null, enviado_por_id: null },
      { status: 201, statusText: 'Created' },
    );
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: notificacionesQueryKeys.raiz });
  });

  it('enviarRecordatorio propaga el 400 del backend (ej. destinatario inexistente)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.enviarRecordatorio.mutateAsync({ destinatario_id: 'p-9' });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/recordatorio` })
      .flush(
        { detail: 'No existe un destinatario en comunidad con id p-9' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
