// Formas de request/response de los endpoints `/api/reservas-semestrales/*`
// (Django Ninja, ver back/reservas_semestrales/controller.py) consumidas por
// esta feature — nombres de campo verificados 1:1 contra los schemas
// `ReservaSemestralOut`, `FranjaIn` y `GrupoReservaSemestralIn` del
// controller (no adivinados), y el prefijo `/reservas-semestrales`
// confirmado en `api.add_router("/reservas-semestrales", ...)` de
// back/config/urls.py.
//
// Igual que en `features/reservas` (su feature hermana): las interfaces se
// consumen tal cual dentro de la propia feature, sin capa pública que
// esconder detrás de un mapeo, así que se mantiene el nombre de campo exacto
// que viaja por HTTP (snake_case).
//
// Nota de dominio — diferencia clave con `ReservaIndividual` (ver
// reservas.models.ts de la feature hermana): `ReservaSemestral` NO es una
// reserva de un día con ciclo de vida de `estado`. Es una franja horaria
// RECURRENTE semanal (día de la semana, no fecha), vigente durante un
// semestre, y SIN columna `estado` — no hay `aprobada`/`cancelada`/etc, así
// que acá no existe `EstadoReserva` ni `p-tag` de severidad por estado.
// "Cancelar" es un DELETE real de las filas del grupo (ver
// back/reservas_semestrales/model.py y su nota de diseño).
//
// Nota de dominio — una sola solicitud de usuario reserva VARIAS franjas a la
// vez (ej. lunes y miércoles 8-10), que comparten un `grupo_id` generado una
// sola vez por el backend al crear el grupo. Por eso el `POST /` no recibe
// una franja suelta sino `GrupoReservaSemestralIn` con `franjas: FranjaIn[]`,
// y la cancelación es `POST /grupo/{grupo_id}/cancelar` (todas las franjas
// del grupo a la vez), no `POST /{id}/cancelar` como en la reserva
// individual.
//
// Nota de alcance — esta feature cubre ÚNICAMENTE la reserva SEMESTRAL. La
// reserva individual es otra tabla, otro módulo del backend (`/api/reservas`)
// y es la feature `features/reservas`: comparten sección en el DDL y prefijo
// de nombre, pero no forma ni reglas.

export interface ErrorDetalleDto {
  detail: string;
}

/**
 * Valores exactos de `DiaSemana` (`models.TextChoices` en
 * back/reservas_semestrales/model.py): los 7 días de la semana en minúscula,
 * sin acentos. Se modela como unión de literales de string en vez de `enum`
 * de TypeScript porque lo que viaja por HTTP es el string crudo — la unión da
 * el mismo chequeo en compilación sin agregar un objeto en runtime (mismo
 * criterio que `EstadoReserva` en la feature hermana).
 */
export type DiaSemana =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo';

// Etiquetas para la UI: capitalización de cada valor, sin traducciones
// inventadas (el backend ya usa español sin acentos en los propios valores).
export const ETIQUETAS_DIA_SEMANA: Record<DiaSemana, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

/**
 * Forma que consume `mat-select`/`mat-autocomplete` (`label` se muestra,
 * `value` es lo que viaja). Igual patrón que `OpcionSelect` de
 * `features/reservas`, duplicado acá por la misma regla dura de no importar
 * TypeScript de otra feature (ver la nota de duplicación deliberada más
 * abajo).
 */
export interface OpcionSelect<T extends string> {
  label: string;
  value: T;
}

function opcionesDesdeEtiquetas<T extends string>(etiquetas: Record<T, string>): OpcionSelect<T>[] {
  return (Object.entries(etiquetas) as [T, string][]).map(([value, label]) => ({ label, value }));
}

export const OPCIONES_DIA_SEMANA = opcionesDesdeEtiquetas(ETIQUETAS_DIA_SEMANA);

/**
 * `ReservaSemestralOut` del controller: una FRANJA individual dentro de un
 * grupo. `hora_inicio`/`hora_fin` viajan como `HH:MM:SS` (serialización de
 * `datetime.time`), sin fecha ni zona horaria: es un horario recurrente
 * semanal, no un instante ni una fecha de calendario. Por eso se tipan como
 * `string` (ver `formatearHora` más abajo, igual criterio que
 * `formatearHora` de `features/reservas`).
 *
 * `creado_manualmente` distingue una franja que un operador registró a mano
 * (cancelable vía API) de una cargada institucionalmente (no cancelable: el
 * backend responde 400 ante `POST /grupo/{grupo_id}/cancelar` si CUALQUIER
 * fila del grupo tiene este campo en `false` — ver el docstring de
 * `back/reservas_semestrales/controller.py`).
 */
export interface ReservaSemestral {
  id: string;
  salon_id: string;
  solicitante_id: string;
  semestre_id: string;
  dia: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
  grupo_id: string;
  creado_manualmente: boolean;
}

/**
 * `FranjaIn` del controller: un día + franja horaria dentro de un grupo a
 * crear. Sin `salon_id`/`solicitante_id`/`semestre_id` porque esos tres son
 * compartidos por TODO el grupo (viven en `GrupoReservaSemestralIn`, no se
 * repiten franja por franja).
 */
export interface FranjaInput {
  dia: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
}

/**
 * `GrupoReservaSemestralIn` del controller: el cuerpo de
 * `POST /api/reservas-semestrales/`. `franjas` es una lista NO vacía (el
 * formulario impide enviar el grupo sin al menos una franja agregada, ver
 * reserva-semestral-form-dialog.component.ts).
 *
 * `creado_manualmente` tiene default `true` en el schema del backend: el
 * formulario de esta feature SIEMPRE crea franjas manuales (es la única vía
 * humana de creación), así que no se expone un control para ese campo — se
 * omite del payload y el backend aplica su propio default. Las franjas con
 * `creado_manualmente=false` solo las produce una carga institucional (fuera
 * del alcance de esta UI).
 */
export interface GrupoReservaSemestralInput {
  salon_id: string;
  solicitante_id: string;
  semestre_id: string;
  franjas: FranjaInput[];
}

// ------------------------------------------------------------------
// Formato de hora recurrente
// ------------------------------------------------------------------

/**
 * `HH:MM:SS` (o `HH:MM`) -> `HH:MM`. Mismo recorte que `formatearHora` de
 * `features/reservas`, duplicado acá por la regla de no importar TypeScript
 * de otra feature. Ante una cadena que no tenga esa forma se devuelve tal
 * cual: el valor lo produce el backend, no el usuario.
 */
export function formatearHora(hora: string): string {
  const partes = /^(\d{2}):(\d{2})/.exec(hora);
  return partes ? `${partes[1]}:${partes[2]}` : hora;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// Las FKs de `ReservaSemestral` viajan como UUID crudo, sin nombres
// denormalizados: la feature resuelve cada id a un nombre legible consultando
// los endpoints de los módulos dueños. Cada tipo declara solo los campos que
// esta feature realmente renderiza — no la forma completa del `*Out` del
// backend.

// `ComunidadOut` de back/comunidad/controller.py: la persona que solicita el
// grupo de reservas. `numero_documento` acompaña al nombre en el selector
// para desambiguar homónimos (misma nota que `features/reservas`).
export interface PersonaLookup {
  id: string;
  nombre: string;
  numero_documento: string;
}

// `SalonOut` de back/catalogos/controller.py: el salón reservado.
export interface SalonLookup {
  id: string;
  nombre: string;
}

// `SemestreOut` de back/programacion/controller.py (`GET /api/programacion/
// semestres`): el semestre durante el cual la franja está vigente. Es la
// TERCERA FK que `ReservaSemestralOut` tiene y que `Reserva` (individual) no
// tiene — de ahí el tercer lookup que no existe en `features/reservas`.
export interface SemestreLookup {
  id: string;
  codigo: string;
  fecha_inicio: string;
  fecha_fin: string;
}
