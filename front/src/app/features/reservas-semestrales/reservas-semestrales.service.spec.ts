import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { environment } from '../../../environments/environment';
import { reservasSemestralesQueryKeys } from './reservas-semestrales-query-keys';
import { ReservasSemestralesService } from './reservas-semestrales.service';

const BASE_URL = `${environment.apiBaseUrl}/reservas-semestrales`;

// Ver la misma nota en reservas.service.spec.ts (feature hermana):
// `injectQuery`/`injectMutation` disparan su lado HTTP de forma asíncrona (un
// tick después de inyectar el servicio o de llamar `mutate*`), no en el mismo
// tick síncrono.
const cederMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const franjaLunes = {
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

const franjaMiercoles = {
  ...franjaLunes,
  id: 'rs-2',
  dia: 'miercoles',
};

describe('ReservasSemestralesService', () => {
  let service: ReservasSemestralesService;
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
    service = TestBed.inject(ReservasSemestralesService);
    httpMock = TestBed.inject(HttpTestingController);
    await cederMicrotask();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta la lista completa (GET /api/reservas-semestrales/)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([franjaLunes, franjaMiercoles]);

    await vi.waitFor(() =>
      expect(service.reservas.data()).toEqual([franjaLunes, franjaMiercoles]),
    );
  });

  it('crear hace POST a /api/reservas-semestrales/ con TODAS las franjas del grupo e invalida el prefijo', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      semestre_id: 'sem-1',
      franjas: [
        { dia: 'lunes', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
        { dia: 'miercoles', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
      ],
    });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/` });
    expect(req.request.body).toEqual({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      semestre_id: 'sem-1',
      franjas: [
        { dia: 'lunes', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
        { dia: 'miercoles', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
      ],
    });
    req.flush([franjaLunes, franjaMiercoles], { status: 201, statusText: 'Created' });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reservasSemestralesQueryKeys.raiz });
  });

  it('crear propaga el 400 del backend (ej. franja solapada con Programacion ya programada)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.crear.mutateAsync({
      salon_id: 'sa-1',
      solicitante_id: 'p-1',
      semestre_id: 'sem-1',
      franjas: [{ dia: 'lunes', hora_inicio: '08:00:00', hora_fin: '10:00:00' }],
    });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/` })
      .flush(
        { detail: 'La franja lunes 08:00:00-10:00:00 se solapa con una programación existente' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });

  it('cancelar hace POST a /grupo/{grupoId}/cancelar SIN cuerpo e invalida el prefijo', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.cancelar.mutateAsync({ grupoId: 'g-1' });
    await cederMicrotask();
    const req = httpMock.expectOne({ method: 'POST', url: `${BASE_URL}/grupo/g-1/cancelar` });
    // El endpoint no declara schema de entrada (ver
    // back/reservas_semestrales/controller.py): no se inventa un cuerpo con
    // campos que el backend ignoraría.
    expect(req.request.body).toBeNull();
    req.flush({ eliminadas: 2 });
    await promesa;

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reservasSemestralesQueryKeys.raiz });
  });

  it('cancelar propaga el 400 del backend (grupo con alguna franja creada institucionalmente)', async () => {
    httpMock.expectOne(`${BASE_URL}/`).flush([]);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const promesa = service.cancelar.mutateAsync({ grupoId: 'g-1' });
    await cederMicrotask();
    httpMock
      .expectOne({ method: 'POST', url: `${BASE_URL}/grupo/g-1/cancelar` })
      .flush(
        { detail: 'No se puede cancelar un grupo con franjas cargadas institucionalmente' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promesa).rejects.toBeTruthy();
  });
});
