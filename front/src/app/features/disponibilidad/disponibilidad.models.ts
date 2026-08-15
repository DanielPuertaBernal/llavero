// Forma de la única respuesta del endpoint `GET /api/disponibilidad/salon/
// {salon_id}` (RF14, ver el contrato del backend en la tarea de esta
// feature). El backend real no vive en este checkout: los nombres de campo
// se toman TAL CUAL del contrato acordado (snake_case, sin reformatear a
// camelCase) siguiendo el mismo criterio que `features/reservas` — esta
// feature consume las interfaces directamente, sin capa pública que esconder
// detrás de un mapeo.
//
// Nota de alcance — esta feature es de SOLO LECTURA: no hay `POST`, `PATCH`
// ni `DELETE` en el contrato. `DisponibilidadService` por lo tanto no declara
// mutaciones ni `invalidar()`, a diferencia de `reservas.service.ts`.
//
// Nota de duplicación deliberada — `ErrorDetalleDto`, `SalonLookup` y las
// utilidades `formatearFecha`/`formatearHora` se declaran acá aunque formas y
// funciones idénticas ya existan en `features/reservas`: la regla dura del
// proyecto (ver front/README.md) es que ninguna feature importa código de
// otra feature, solo de `core/`.

export interface ErrorDetalleDto {
  detail: string;
}

/**
 * Las tres fuentes que el backend superpone para armar la disponibilidad de
 * un salón: la programación académica (clases fijas), las reservas
 * semestrales (franja recurrente durante un semestre) y las reservas
 * individuales (una fecha puntual). Es la razón de ser de esta vista: ver
 * las tres superpuestas y sus conflictos, no solo una lista de una fuente.
 */
export type Origen = 'programacion' | 'reserva_semestral' | 'reserva_individual';

// Etiquetas para la UI de cada origen — usadas por el badge de cada fila
// (ver disponibilidad-vista.component.ts).
export const ETIQUETAS_ORIGEN: Record<Origen, string> = {
  programacion: 'Programación académica',
  reserva_semestral: 'Reserva semestral',
  reserva_individual: 'Reserva individual',
};

/**
 * Días de la semana en español, en minúscula, tal como los espera y devuelve
 * el query param `dia` y el campo `dia_semana`/`dia` del contrato.
 */
export type DiaSemana =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo';

/**
 * Mismos cuatro valores de `EstadoReserva` en `features/reservas` (el mismo
 * enum del backend), pero acá SIEMPRE nullable: una ocupación de origen
 * `programacion` no tiene estado de reserva (no es una reserva), así que el
 * contrato la modela como `estado: null` para esas filas.
 */
export type EstadoOcupacion = 'aprobada' | 'cancelada' | 'completada' | 'no_reclamada' | null;

/**
 * Una fila del arreglo `ocupaciones` de la respuesta. `dia_semana` y `fecha`
 * son mutuamente excluyentes según `origen`/`recurrente` (una ocupación
 * recurrente trae `dia_semana` y `fecha: null`; una puntual, al revés) — la
 * vista no necesita distinguirlos porque ya consultó por un día/fecha
 * concretos y el backend ya resolvió cuáles aplican.
 */
export interface Ocupacion {
  origen: Origen;
  id: string;
  recurrente: boolean;
  dia_semana: DiaSemana | null;
  fecha: string | null;
  hora_inicio: string;
  hora_fin: string;
  titulo: string;
  responsable_id: string;
  estado: EstadoOcupacion;
}

/**
 * Un par de ocupaciones de origen DISTINTO que se solapan en horario (el
 * backend solo calcula conflictos cuando la consulta trae `fecha`). Se
 * referencia por id: la vista cruza estos ids contra `ocupaciones` para
 * saber qué filas resaltar (ver `disponibilidad-vista.component.ts`).
 */
export interface Conflicto {
  ocupacion_a_id: string;
  ocupacion_b_id: string;
}

/** `200` de `GET /api/disponibilidad/salon/{salon_id}`. */
export interface DisponibilidadSalon {
  salon_id: string;
  dia: DiaSemana | null;
  fecha: string | null;
  ocupaciones: Ocupacion[];
  conflictos: Conflicto[];
}

// ------------------------------------------------------------------
// Lookup
// ------------------------------------------------------------------

// `SalonOut` de back/catalogos/controller.py (mismo campo que
// `features/reservas` consume): solo `id` y `nombre`, lo único que esta
// vista muestra en el selector.
export interface SalonLookup {
  id: string;
  nombre: string;
}

// ------------------------------------------------------------------
// Formato de fecha/hora de calendario
// ------------------------------------------------------------------
//
// Copia exacta de `formatearFecha`/`formatearHora` de
// `features/reservas/reservas.models.ts` — mismo motivo ahí documentado: son
// fechas/horas de CALENDARIO (`date`/`time` de Django Ninja, sin zona) y
// pasarlas por `Date`/`DatePipe` las correría un día en Colombia (UTC-5).

/** `YYYY-MM-DD` -> `DD/MM/YYYY`, sin pasar por `Date`. */
export function formatearFecha(fecha: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha;
}

/** `HH:MM:SS` (o `HH:MM`) -> `HH:MM`. */
export function formatearHora(hora: string): string {
  const partes = /^(\d{2}):(\d{2})/.exec(hora);
  return partes ? `${partes[1]}:${partes[2]}` : hora;
}
