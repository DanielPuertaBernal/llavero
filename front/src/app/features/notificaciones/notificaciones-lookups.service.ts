import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { notificacionesQueryKeys } from './notificaciones-query-keys';
import type { PersonaLookup } from './notificaciones.models';

const API = environment.apiBaseUrl;

/**
 * Catálogo de apoyo que la feature `notificaciones` necesita para (a)
 * resolver a nombre legible `destinatario_id` (la única FK que
 * `NotificacionOut` devuelve como UUID crudo hacia `comunidad`, ver
 * back/notificaciones/model.py) y (b) poblar el selector de destinatario del
 * diálogo de envío.
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): lo prohibido es importar el
 * TypeScript de otra feature; llamar a `GET /api/comunidad/` es consumir la
 * API pública HTTP de otro módulo del backend, exactamente lo mismo que hace
 * `features/reservas` con su propio `ReservasLookupsService`. Por eso este
 * lookup vive acá, con su propio tipo (`notificaciones.models.ts`) y su
 * propia clave de caché (`notificaciones-query-keys.ts`), en vez de
 * reutilizar el servicio de `features/reservas`.
 *
 * Un solo lookup (contra los dos de `reservas` o los cinco de `prestamos`)
 * porque `Notificacion` solo tiene una FK que esta feature necesita resolver:
 * `enviado_por_id` (usuario de staff) no se muestra en ninguna vista — el
 * operador que envía una notificación manual ya sabe quién es, es
 * `AuthService.currentUser()` (ver `notificacion-form-dialog.component.ts`),
 * no un dato que haya que resolver a nombre en una tabla.
 *
 * Solo lectura: esta feature nunca crea ni edita personas de comunidad — no
 * hay mutaciones acá, y por lo tanto tampoco un `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesLookupsService {
  private readonly http = inject(HttpClient);

  readonly personas = injectQuery(() => ({
    queryKey: notificacionesQueryKeys.lookupPersonas,
    queryFn: () => firstValueFrom(this.http.get<PersonaLookup[]>(`${API}/comunidad/`)),
  }));

  // Opciones ya formateadas para `mat-select`. Viven acá (y no en cada
  // componente) porque el selector de destinatario se usa tanto en el filtro
  // futuro por destinatario como en el diálogo de envío.
  readonly opcionesPersonas = computed(() =>
    (this.personas.data() ?? []).map((persona) => ({
      // El documento desambigua homónimos, frecuentes en una comunidad
      // universitaria grande — mismo criterio que `ReservasLookupsService`.
      label: `${persona.nombre} (${persona.numero_documento})`,
      value: persona.id,
    })),
  );

  // El resolutor devuelve el id crudo como respaldo mientras el lookup no
  // haya cargado (o si el id no está en la lista): la tabla siempre muestra
  // algo, nunca una celda vacía ni un "undefined".
  nombrePersona(personaId: string): string {
    return this.personas.data()?.find((persona) => persona.id === personaId)?.nombre ?? personaId;
  }
}
