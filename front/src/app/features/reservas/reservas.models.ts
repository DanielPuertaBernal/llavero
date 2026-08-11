// Formas de request/response de los endpoints `/api/reservas/*` (Django
// Ninja, ver back/reservas/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `ReservaIndividualOut`
// y `ReservaIndividualIn` del controller (no adivinados), y el prefijo
// `/reservas` confirmado en `api.add_router("/reservas", ...)` de
// back/config/urls.py.
//
// Igual que en `features/prestamos`, `features/llaves` y
// `features/catalogos`: las interfaces se consumen tal cual dentro de la
// propia feature, sin capa pública que esconder detrás de un mapeo, así que
// se mantiene el nombre de campo exacto que viaja por HTTP (snake_case) en
// vez de duplicar cada forma en una versión camelCase sin necesidad real.
//
// Nota de alcance — `ReservaIndividual` NO es un CRUD: el backend expone solo
// `GET /`, `GET /{id}`, `GET /solicitante/{id}`, `POST /` y
// `POST /{id}/cancelar`. No hay PATCH ni DELETE (ver
// back/reservas/controller.py): una reserva es un evento de ciclo de vida
// (`aprobada` -> `cancelada`/`completada`/`no_reclamada`), no una fila
// editable. Por eso acá no existe un tipo
// `ReservaPatch`/`Partial<ReservaInput>`.
//
// Nota de alcance — esta feature cubre ÚNICAMENTE la reserva INDIVIDUAL. La
// reserva semestral es otra tabla, otro módulo del backend
// (`/api/reservas-semestrales`, ver back/config/urls.py) y será otra feature:
// comparten sección en el DDL y prefijo de nombre, pero no forma ni reglas
// (ver la nota de diseño de back/reservas/model.py).
//
// Nota de duplicación deliberada — `ErrorDetalleDto` y los tipos de lookup
// (`PersonaLookup`, `SalonLookup`) se declaran acá aunque formas parecidas ya
// existan en `features/prestamos` y `features/catalogos`: la regla dura del
// proyecto (ver front/README.md y DOC/4.3 Diagrama de Paquetes.md) es que
// ninguna feature importa código de otra feature, solo de `core/`. Consumir
// el endpoint HTTP de otro módulo del backend sí está permitido (es una API
// pública); importar el TypeScript de otra feature no.

export interface ErrorDetalleDto {
  detail: string;
}

// Valores exactos de `EstadoReservaIndividual` (`models.TextChoices` en
// back/reservas/model.py). Se modela como unión de literales de string en vez
// de `enum` de TypeScript porque lo que viaja por HTTP es el string crudo: la
// unión da el mismo chequeo en compilación sin agregar un objeto en runtime.
export type EstadoReserva = 'aprobada' | 'cancelada' | 'completada' | 'no_reclamada';

// Etiquetas para la UI: son las mismas del segundo elemento de cada
// `TextChoices` del backend (ej. `NO_RECLAMADA = "no_reclamada", "No
// reclamada"`), no traducciones inventadas acá.
export const ETIQUETAS_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  aprobada: 'Aprobada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  no_reclamada: 'No reclamada',
};

/**
 * Forma que consume `p-select` de PrimeNG (`optionLabel="label"`,
 * `optionValue="value"`). La lista de opciones del enum se deriva del mapa de
 * etiquetas de arriba en vez de escribirse a mano: agregar un valor al enum
 * del backend y su etiqueta acá es suficiente para que aparezca en el
 * selector de la feature.
 */
export interface OpcionSelect<T extends string> {
  label: string;
  value: T;
}

function opcionesDesdeEtiquetas<T extends string>(etiquetas: Record<T, string>): OpcionSelect<T>[] {
  return (Object.entries(etiquetas) as [T, string][]).map(([value, label]) => ({ label, value }));
}

export const OPCIONES_ESTADO_RESERVA = opcionesDesdeEtiquetas(ETIQUETAS_ESTADO_RESERVA);

/**
 * `ReservaIndividualOut` del controller.
 *
 * `fecha` viaja como `YYYY-MM-DD` y `hora_inicio`/`hora_fin` como `HH:MM:SS`
 * (serialización de `datetime.date`/`datetime.time` de Django Ninja): son
 * fechas y horas de CALENDARIO, sin zona horaria — a diferencia de
 * `fecha_creacion` de otras features, que es un instante (`datetime` con
 * `auto_now_add`). Por eso se tipan como `string` y NUNCA se convierten a
 * `Date` para mostrarlas: un `new Date('2026-08-20')` se interpreta como
 * medianoche UTC y en Colombia (UTC-5) se renderizaría como el día anterior.
 * Ver `formatearFecha`/`formatearHora` más abajo.
 *
 * `estado` lo fija el backend (nace siempre `aprobada`, default del DDL), por
 * eso no aparece en `ReservaInput`.
 */
export interface Reserva {
  id: string;
  salon_id: string;
  solicitante_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string | null;
  estado: EstadoReserva;
}

/**
 * `ReservaIndividualIn` del controller: el cuerpo de `POST /api/reservas/`.
 *
 * `motivo` es el único campo opcional (`str | None = None` en el schema). Se
 * OMITE del payload cuando el operador no escribe nada, en vez de mandar
 * `''`: una cadena vacía sería un motivo vacío guardado en la columna, que no
 * es lo mismo que "sin motivo" (`NULL`).
 *
 * El formulario NO replica las reglas de negocio del backend: que el salón y
 * el solicitante existan, y que la franja no se solape con otra reserva ya
 * `aprobada` del mismo salón esa fecha, lo decide `reservas.service` y su 400
 * se muestra tal cual (ver reservas-error.util.ts).
 */
export interface ReservaInput {
  salon_id: string;
  solicitante_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo?: string;
}

// ------------------------------------------------------------------
// Formato de fecha/hora de calendario
// ------------------------------------------------------------------

/**
 * `YYYY-MM-DD` -> `DD/MM/YYYY`, sin pasar por `Date`.
 *
 * No se usa `DatePipe` para estos campos justamente por eso: `DatePipe`
 * necesita un `Date` (o parsea la cadena como ISO, es decir UTC) y desplaza
 * el día en cualquier zona al oeste de Greenwich — Colombia es UTC-5, así que
 * una reserva del 20/08 se vería como 19/08. Estas son fechas de calendario,
 * no instantes: se reformatean como texto.
 *
 * Ante una cadena que no tenga esa forma se devuelve tal cual, en vez de
 * mostrar `NaN`: el valor lo produce el backend, no el usuario.
 */
export function formatearFecha(fecha: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha;
}

/**
 * `HH:MM:SS` (o `HH:MM`) -> `HH:MM`. Los segundos que serializa
 * `datetime.time` son siempre `00` en este dominio (la franja se elige con
 * granularidad de minutos) y solo agregan ruido en la tabla.
 */
export function formatearHora(hora: string): string {
  const partes = /^(\d{2}):(\d{2})/.exec(hora);
  return partes ? `${partes[1]}:${partes[2]}` : hora;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// Las FKs de `Reserva` viajan como UUID crudo, sin nombres denormalizados: la
// feature resuelve cada id a un nombre legible consultando los endpoints de
// los módulos dueños. Cada tipo declara solo los campos que esta feature
// realmente renderiza — no la forma completa del `*Out` del backend.

// `ComunidadOut` de back/comunidad/controller.py: la persona que solicita la
// reserva. `numero_documento` acompaña al nombre en el selector para
// desambiguar homónimos.
export interface PersonaLookup {
  id: string;
  nombre: string;
  numero_documento: string;
}

// `SalonOut` de back/catalogos/controller.py: el salón reservado. Solo se
// traen `id` y `nombre` — ni `cantidad_sillas` ni `bloque_id` los muestra
// ninguna vista de esta feature.
export interface SalonLookup {
  id: string;
  nombre: string;
}
