// Formas de request/response de `/api/programacion/*` (Django Ninja, ver
// back/programacion/controller.py) consumidas por esta feature — nombres de
// campo verificados 1:1 contra `SemestreOut`/`ImportarProgramacionOut` del
// controller, mismo criterio que el resto de features (snake_case tal cual
// viaja por HTTP, sin mapeo a camelCase).
//
// Nota de alcance — el backend NO expone PATCH ni DELETE sobre `Semestre`
// (solo `GET /semestres` y `POST /semestres`, este último indirecto vía
// `POST /importar`): no hay edición ni borrado real de un semestre ya
// cargado. La UI de esta feature refleja eso (ver programacion-list.component.ts
// y su nota sobre los botones de editar/eliminar deshabilitados).

export interface ErrorDetalleDto {
  detail: string;
}

export interface Semestre {
  id: string;
  codigo: string;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface ImportarOmitida {
  fila: number;
  motivo: string;
}

export interface ImportarProgramacionOut {
  creadas: number;
  creadas_sin_docente: number;
  omitidas: ImportarOmitida[];
  semestre: Semestre;
}

/** Solo el campo que esta feature necesita de `ProgramacionOut`
 * (`GET /api/programacion/`): agrupar registros por semestre para mostrar
 * un conteo real en cada tarjeta (ver programacion-list.component.ts) — el
 * backend no expone un conteo agregado por semestre, así que se calcula acá
 * en el cliente sobre la lista completa. */
export interface ProgramacionResumen {
  id: string;
  semestre_id: string;
}

/** `YYYY-MM-DD` -> `DD/MM/YYYY`, sin pasar por `Date` (fecha de calendario,
 * copia del criterio ya documentado en `features/reservas`/`disponibilidad`). */
export function formatearFecha(fecha: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha;
}
