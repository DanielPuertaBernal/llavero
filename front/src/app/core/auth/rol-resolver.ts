import type { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';

interface RolLookupDto {
  id: string;
  nombre: string;
}

/**
 * Resuelve un `rolId` (UUID, ver `UsuarioAutenticado.rolId`) a su nombre
 * legible (`"Administrador"`, `"Auxiliar"`, `"Portero"`), consultando
 * `GET /api/catalogos/roles` (ver back/catalogos/controller.py).
 *
 * Extraído de `rol.guard.ts` (el primer consumidor, ver su docblock para la
 * nota de diseño completa de por qué el rol se resuelve contra un HTTP GET y
 * no contra un enum fijo en el cliente) para que la feature `historial`
 * (RF28: Portero ve solo lo que él procesó, Administrador/Auxiliar ven todo)
 * pueda reusar la misma resolución sin duplicar la llamada a
 * `/api/catalogos/roles` ni la lógica de búsqueda por id.
 *
 * Deliberadamente NO decide qué hacer si la consulta falla o el rol no
 * aparece en el catálogo — devuelve `null` en el segundo caso y deja que el
 * `Promise` rechace en el primero, tal cual venga del `HttpClient`. Cada
 * caller falla como le corresponda: `rol.guard.ts` falla CERRADO (redirige a
 * `/dashboard`); `historial.service.ts` falla hacia el subconjunto más
 * restringido (filtra por el usuario actual) en vez de bloquear la
 * navegación, porque a diferencia de `comunidad` esta ruta no está
 * bloqueada por rol (ver la nota de alcance en `historial.service.ts`).
 */
export async function resolverNombreRol(http: HttpClient, rolId: string): Promise<string | null> {
  const roles = await firstValueFrom(
    http.get<RolLookupDto[]>(`${environment.apiBaseUrl}/catalogos/roles`),
  );
  return roles.find((rol) => rol.id === rolId)?.nombre ?? null;
}
