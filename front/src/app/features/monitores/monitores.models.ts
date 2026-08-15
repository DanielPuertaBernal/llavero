// Formas de request/response de los endpoints `/api/monitores/*` (Django
// Ninja, ver back/monitores/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `MonitorOut`/
// `MonitorIn` del controller (no adivinados).
//
// Igual que en `features/usuarios`, `features/reservas` y
// `features/prestamos`: las interfaces se consumen tal cual dentro de la
// propia feature, sin capa pública que esconder detrás de un mapeo, así que
// se mantiene el nombre de campo exacto que viaja por HTTP (snake_case).
//
// Nota de alcance — `Monitor` NO es un CRUD, y es estructuralmente más
// parecido a `Usuario` que a `Reserva`: el backend expone solo `GET /`,
// `GET /{id}`, `POST /` y `POST /{id}/desactivar` (ver
// back/monitores/controller.py). No hay PATCH ni DELETE, y — a diferencia de
// `usuarios` — TAMPOCO hay `POST /{id}/reactivar`: `desactivar` es la única
// transición de `activo`, y no tiene vuelta atrás por esta API. Por eso acá
// no existe un tipo `MonitorPatch`/`Partial<MonitorInput>`, y el diálogo de
// desactivación advierte que la acción no se puede deshacer (ver
// `MonitorDesactivacionDialogComponent`).
//
// Nota de alcance — dos endpoints más que este feature SÍ consume, ambos de
// solo lectura:
//
// 1. `GET /monitor-delegado/{id}/monitorias`: monitorías activas de un
//    monitor delegado. Es el equivalente de "¿esta persona es monitor de
//    alguien?", pensado para el futuro módulo `llaves` (ver el docstring de
//    back/monitores/service.py) — no para esta UI de administración, que ya
//    lista y filtra por monitor delegado en memoria sobre `GET /`. No se
//    modela acá a propósito: es un endpoint de consumo entre backends, igual
//    que `POST /vincular-oid-microsoft` de `usuarios` no se modela en su
//    feature.
// 2. `GET /{id}/clases-docente-titular`: las clases (`programacion`) del
//    docente titular de una monitoría. Esta SÍ se consume (ver
//    `ClaseDocente` más abajo): da contexto real al operador sobre el
//    horario del docente titular al registrar o revisar una monitoría.

export interface ErrorDetalleDto {
  detail: string;
}

// Valores exactos de `DiaSemana` (`models.TextChoices` en
// back/monitores/model.py). Unión de literales de string, no `enum` de
// TypeScript: lo que viaja por HTTP es el string crudo.
export type DiaSemana =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo';

// Etiquetas para la UI: son las mismas del segundo elemento de cada
// `TextChoices` del backend, no traducciones inventadas acá.
export const ETIQUETAS_DIA_SEMANA: Record<DiaSemana, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

/** Forma que consume `mat-select`/`mat-autocomplete` (`label` se muestra,
 * `value` es lo que viaja). */
export interface OpcionSelect<T> {
  label: string;
  value: T;
}

export const OPCIONES_DIA_SEMANA: OpcionSelect<DiaSemana>[] = (
  Object.entries(ETIQUETAS_DIA_SEMANA) as [DiaSemana, string][]
).map(([value, label]) => ({ label, value }));

/**
 * `MonitorOut` del controller.
 *
 * `docente_titular_id` y `monitor_delegado_id` son dos FKs distintas a la
 * MISMA entidad `Comunidad` (ver back/monitores/model.py): un docente que
 * dicta la materia y un estudiante que hace de monitor delegado para ella.
 * `aula`, `dia` y `horario` son NULLABLE en el backend — una monitoría puede
 * no tener aula fija, día fijo (delegación abierta a cualquier día en que el
 * docente titular tenga clase) u horario fijo.
 */
export interface Monitor {
  id: string;
  docente_titular_id: string;
  monitor_delegado_id: string;
  materia: string;
  aula: string | null;
  dia: DiaSemana | null;
  horario: string | null;
  activo: boolean;
}

/**
 * `MonitorIn` del controller: el cuerpo de `POST /api/monitores/`.
 *
 * El formulario NO replica la validación de negocio del backend (que
 * `docente_titular_id` y `monitor_delegado_id` existan en `comunidad`, y que
 * sean personas distintas — `domain.validar_docente_distinto_de_monitor`,
 * ver back/monitores/service.py): el 400 del backend se muestra tal cual
 * (ver monitores-error.util.ts). Los dos selectores del formulario ya solo
 * ofrecen ids de personas reales, así que la única validación que puede
 * fallar de verdad es "misma persona en ambos roles", y esa es del backend.
 */
export interface MonitorInput {
  docente_titular_id: string;
  monitor_delegado_id: string;
  materia: string;
  aula?: string;
  dia?: DiaSemana;
  horario?: string;
}

/**
 * Filtro de estado de la vista de lista. Igual que en `usuarios` y a
 * diferencia de `llaves`/`prestamos`: acá NO hay un endpoint
 * `GET /estado/{estado}` (ver back/monitores/controller.py, que solo expone
 * `GET /`), así que es un filtro de cliente sobre la lista ya descargada.
 */
export type FiltroEstadoMonitor = 'todos' | 'activos' | 'inactivos';

export const OPCIONES_FILTRO_ESTADO_MONITOR: OpcionSelect<FiltroEstadoMonitor>[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Activos', value: 'activos' },
  { label: 'Inactivos', value: 'inactivos' },
];

// ------------------------------------------------------------------
// Clases del docente titular
// ------------------------------------------------------------------

/**
 * Elemento de la respuesta de `GET /api/monitores/{id}/clases-docente-titular`
 * (ver back/monitores/controller.py: una lista de `dict`, no un `Schema`
 * declarado, así que esta forma se verificó contra el diccionario armado a
 * mano en ese endpoint, campo por campo).
 *
 * `hora_inicio`/`hora_fin` viajan como `HH:MM:SS` (`datetime.time.isoformat()`)
 * y `dia` como el `DiaSemana` de `programacion` — mismos 7 valores que el
 * `DiaSemana` de esta feature, así que se reutiliza el mismo tipo unión: no
 * hay ninguna FK ni import de módulo de por medio en reusar 7 literales de
 * string idénticos del lado del cliente (a diferencia del backend, que sí
 * evita ese acoplamiento entre `models.py`, ver la nota de diseño ahí).
 *
 * Nota de alcance — `salon_id` NO se resuelve a nombre acá: hacerlo
 * requeriría un tercer lookup (`catalogos.Salon`) que ninguna otra vista de
 * esta feature necesita, solo para una columna de una tabla de solo lectura
 * dentro de una fila ya expandida. Se muestra el id crudo; promover un
 * lookup de salones es una decisión a tomar si esta vista gana más peso.
 */
export interface ClaseDocente {
  id: string;
  salon_id: string;
  semestre_id: string;
  dia: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
  materia: string;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// Las dos FKs de `Monitor` viajan como UUID crudo: la feature resuelve cada
// id a un nombre legible consultando `GET /api/comunidad/`, el módulo dueño.

// `ComunidadOut` de back/comunidad/controller.py: mismo tipo que
// `PersonaLookup` de `features/reservas` (duplicado a propósito, ver la nota
// de duplicación deliberada más abajo). Una sola forma sirve para los DOS
// roles que esta feature necesita (docente titular y monitor delegado): son
// la misma entidad `Comunidad`, solo el ROL en la monitoría cambia, no la
// forma de la persona ni el endpoint que la resuelve.
export interface PersonaLookup {
  id: string;
  nombre: string;
  numero_documento: string;
}

// Nota de duplicación deliberada — `ErrorDetalleDto` y `PersonaLookup` se
// declaran acá aunque formas idénticas ya existan en `features/reservas` y
// `features/usuarios`: la regla dura del proyecto (ver front/README.md) es
// que ninguna feature importa código de otra feature, solo de `core/`.
