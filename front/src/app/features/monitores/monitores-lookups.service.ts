import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { monitoresQueryKeys } from './monitores-query-keys';
import type { PersonaLookup } from './monitores.models';

const API = environment.apiBaseUrl;

/**
 * Catálogo de apoyo que la feature `monitores` necesita para (a) resolver a
 * nombre legible las DOS FKs que `MonitorOut` devuelve como UUID crudo
 * (`docente_titular_id`, `monitor_delegado_id`) y (b) poblar los DOS
 * autocompletados de personas del formulario de creación.
 *
 * Nota de diseño — un solo lookup para los dos roles: `docente_titular_id` y
 * `monitor_delegado_id` son dos FKs distintas a la MISMA tabla `Comunidad`
 * (ver back/monitores/model.py), así que un único
 * `GET /api/comunidad/` alcanza para resolver ambas. No hay
 * `opcionesDocentes`/`opcionesMonitores` separados: `ComunidadOut` no trae
 * ningún campo que distinga "quién puede ser docente titular" de "quién
 * puede ser monitor delegado" (a diferencia de, por ejemplo, `UbicacionOut`
 * en `prestamos`, que sí tiene flags de permiso que sí condicionan un
 * selector) — el backend tampoco lo distingue: `crear_monitor` solo valida
 * que ambos ids existan y sean distintos entre sí
 * (`domain.validar_docente_distinto_de_monitor`). El ROL es un dato de la
 * fila `Monitor`, no de la persona. `MonitorFormDialogComponent` reusa
 * `opcionesPersonas()` en los dos autocompletados, distinguidos solo por su
 * `<mat-label>` ("Docente titular" / "Monitor delegado").
 *
 * Nota de arquitectura — esto NO viola la regla "una feature no importa
 * código de otra feature" (ver front/README.md): consumir
 * `GET /api/comunidad/` es consumir la API pública HTTP de otro módulo del
 * backend, igual que cualquier cliente. Por eso esta consulta vive acá, con
 * sus propios tipos (`monitores.models.ts`) y su propia clave de caché
 * (`monitores-query-keys.ts`), en vez de reusar el lookup de `reservas` o
 * `usuarios` (que además está prohibido importar).
 *
 * Solo lectura: esta feature nunca crea ni edita personas — no hay
 * mutaciones acá, y por lo tanto tampoco un `invalidar()`.
 */
@Injectable({ providedIn: 'root' })
export class MonitoresLookupsService {
  private readonly http = inject(HttpClient);

  readonly personas = injectQuery(() => ({
    queryKey: monitoresQueryKeys.lookupPersonas,
    queryFn: () => firstValueFrom(this.http.get<PersonaLookup[]>(`${API}/comunidad/`)),
  }));

  // Opciones ya formateadas para los selectores. El documento desambigua
  // homónimos, frecuentes en una comunidad universitaria grande — mismo
  // criterio que `ReservasLookupsService.opcionesPersonas`.
  readonly opcionesPersonas = computed(() =>
    (this.personas.data() ?? []).map((persona) => ({
      label: `${persona.nombre} (${persona.numero_documento})`,
      value: persona.id,
    })),
  );

  // Respaldo al id crudo mientras el lookup no haya cargado (o si el id no
  // está en la lista): la tabla siempre muestra algo, nunca una celda vacía.
  nombrePersona(personaId: string): string {
    return (
      this.personas.data()?.find((persona) => persona.id === personaId)?.nombre ?? personaId
    );
  }
}
