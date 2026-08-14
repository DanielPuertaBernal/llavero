// Formas de request/response de los endpoints `/api/novedades/*` (Django
// Ninja, ver back/novedades/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `NovedadOut`/
// `NovedadIn`/`CerrarNovedadIn` del controller (no adivinados).
//
// Igual que en `features/usuarios`, `features/monitores` y `features/reservas`:
// las interfaces se consumen tal cual dentro de la propia feature, sin capa
// pública que esconder detrás de un mapeo, así que se mantiene el nombre de
// campo exacto que viaja por HTTP (snake_case).
//
// Nota de alcance — `Novedad` NO es un CRUD, y es estructuralmente más
// parecida a `Usuario` que a `Reserva`: el backend expone `GET /`,
// `GET /{id}`, `POST /`, `GET /estado/{estado}`, `GET /categoria/{categoria}`
// y `POST /{id}/cerrar` (ver back/novedades/controller.py). No hay PATCH ni
// DELETE, y — a diferencia de `usuarios` — TAMPOCO hay `POST /{id}/reabrir`:
// `cerrar` es la única transición de `estado`, y no tiene vuelta atrás por
// esta API (confirmado leyendo el controller completo: solo declara los 6
// endpoints de arriba). Por eso el diálogo de cierre advierte que la acción
// no se puede deshacer, mismo criterio que
// `MonitorDesactivacionDialogComponent`.
//
// Nota de alcance — dominio: una `Novedad` NO tiene FK hacia `Llave` ni
// `Equipo` — es al revés (`llaves.model.Llave` y
// `prestamos.model.DetallePrestamo` tienen cada uno su propio `novedad_id`
// opcional apuntando HACIA una novedad, ver back/novedades/model.py). Esta
// feature es un registro INDEPENDIENTE de incidentes; el backend de
// novedades no expone esa relación inversa, así que ninguna vista de acá
// muestra "a qué llave/equipo pertenece" una novedad.
//
// Nota de duplicación deliberada — `ErrorDetalleDto` y `UsuarioLookup` se
// declaran acá aunque formas parecidas ya existan en `features/usuarios`: la
// regla dura del proyecto (ver front/README.md y
// DOC/4.3 Diagrama de Paquetes.md) es que ninguna feature importa código de
// otra feature, solo de `core/`. Consumir el endpoint HTTP de otro módulo del
// backend sí está permitido (es una API pública); importar el TypeScript de
// otra feature no.

export interface ErrorDetalleDto {
  detail: string;
}

// Valores exactos de `CategoriaNovedad`/`EstadoNovedad` (`models.TextChoices`
// en back/novedades/model.py). Unión de literales de string, no `enum` de
// TypeScript: lo que viaja por HTTP es el string crudo.
export type CategoriaNovedad = 'dano' | 'perdida' | 'otro';
export type EstadoNovedad = 'abierta' | 'cerrada';

// Etiquetas para la UI: son las mismas del segundo elemento de cada
// `TextChoices` del backend, no traducciones inventadas acá.
export const ETIQUETAS_CATEGORIA_NOVEDAD: Record<CategoriaNovedad, string> = {
  dano: 'Daño',
  perdida: 'Pérdida',
  otro: 'Otro',
};

export const ETIQUETAS_ESTADO_NOVEDAD: Record<EstadoNovedad, string> = {
  abierta: 'Abierta',
  cerrada: 'Cerrada',
};

/** Forma que consume `p-select` de PrimeNG (`optionLabel`/`optionValue`). */
export interface OpcionSelect<T> {
  label: string;
  value: T;
}

function opcionesDesdeEtiquetas<T extends string>(etiquetas: Record<T, string>): OpcionSelect<T>[] {
  return (Object.entries(etiquetas) as [T, string][]).map(([value, label]) => ({ label, value }));
}

// Opciones de los dos filtros de SERVIDOR de la lista (ver
// `NovedadesListComponent`/`NovedadesService`).
export const OPCIONES_CATEGORIA_NOVEDAD = opcionesDesdeEtiquetas(ETIQUETAS_CATEGORIA_NOVEDAD);
export const OPCIONES_ESTADO_NOVEDAD = opcionesDesdeEtiquetas(ETIQUETAS_ESTADO_NOVEDAD);

/**
 * `NovedadOut` del controller. `descripcion` y `solucion` son nullable: toda
 * novedad nace sin `solucion` (solo se llena al cerrar, ver
 * `service.cerrar_novedad`), y `descripcion` es opcional desde la creación.
 */
export interface Novedad {
  id: string;
  categoria: CategoriaNovedad;
  descripcion: string | null;
  estado: EstadoNovedad;
  solucion: string | null;
  registrado_por_id: string;
}

/**
 * `NovedadIn` del controller: el cuerpo de `POST /api/novedades/`. `estado`
 * NO se envía — nace siempre `abierta` (default del backend, ver
 * back/novedades/model.py) — y tampoco `solucion`, que solo existe una vez
 * cerrada. `registrado_por_id` no lo elige el operador en un selector: sale
 * de `AuthService.currentUser().id` (ver `NovedadFormDialogComponent`, mismo
 * patrón que `UsuariosListComponent.desactivar` toma `usuario_actual_id`).
 */
export interface NovedadInput {
  categoria: CategoriaNovedad;
  registrado_por_id: string;
  descripcion?: string;
}

/**
 * Variables de `POST /api/novedades/{id}/cerrar`. `id` identifica a la
 * novedad OBJETIVO y viaja en la URL; `solucion` es el cuerpo completo
 * (`CerrarNovedadIn`). El backend rechaza con 400 una `solucion` vacía (ver
 * back/novedades/controller.py -> service -> domain), así que el diálogo de
 * cierre valida lo mismo del lado cliente antes de enviar.
 */
export interface CerrarNovedadVariables {
  id: string;
  solucion: string;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// `NovedadOut` devuelve `registrado_por_id` como UUID crudo: la feature lo
// resuelve consultando `GET /api/usuarios/`, el mismo lookup que ya usa
// `features/usuarios` para su propio padrón — pero declarado local acá
// (regla dura: ninguna feature importa el TypeScript de otra).

/**
 * `UsuarioOut` de back/usuarios/controller.py. Solo se declaran `id` y
 * `nombre`: esta feature únicamente resuelve "quién registró la novedad" a
 * un nombre legible, no reimplementa el padrón completo de operadores.
 */
export interface UsuarioLookup {
  id: string;
  nombre: string;
}
