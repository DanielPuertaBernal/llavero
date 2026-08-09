import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { authInterceptor } from '../auth/auth.interceptor';

/**
 * Infraestructura HTTP compartida por todo el frontend (Core, ver
 * `DOC/4. DiseñoTacticoDetallado/4.3 Diagrama de Paquetes.md`): el
 * `HttpClient` de Angular con el interceptor de auth (bearer token +
 * refresh dedup, ver `auth.interceptor.ts`), y TanStack Query como cache de
 * server-state para los servicios de datos de cada feature
 * (`@tanstack/angular-query-experimental`, decidido en
 * `AulaSync/analisis/estrategia-migracion/frontend.md`).
 *
 * La configuración de `QueryClient` (staleTime, retry, etc. por defecto)
 * es intencionalmente mínima en este scaffold — cada feature futura ajusta
 * `queryKey`/`staleTime`/`refetchInterval` según necesite (ej. el polling
 * de disponibilidad), no hay un default global que valga para las 15
 * features todavía inexistentes.
 */
export function provideCoreHttp(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTanStackQuery(new QueryClient()),
  ]);
}
