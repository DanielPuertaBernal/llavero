// Forma MÍNIMA de la respuesta de `GET /api/disponibilidad/salon/{salon_id}`
// (RF14, ver back/disponibilidad/controller.py) que necesita el panel
// "Agenda de disponibilidad" del diálogo de registro de reserva individual
// (ver reserva-agenda-disponibilidad.component.ts).
//
// Nota de duplicación deliberada — copia reducida de
// `features/disponibilidad/disponibilidad.models.ts` (mismo criterio
// documentado ahí y en `reservas.models.ts`: ninguna feature importa el
// TypeScript de otra feature, solo su API HTTP pública — ver
// front/README.md). Solo se traen los campos que el panel efectivamente
// pinta; no se copia `Conflicto`/`conflictos` porque este panel no resalta
// solapamientos, esa es la responsabilidad propia de la vista
// `disponibilidad`.

export type OrigenOcupacion = 'programacion' | 'reserva_semestral' | 'reserva_individual';

export const ETIQUETAS_ORIGEN_OCUPACION: Record<OrigenOcupacion, string> = {
  programacion: 'Clase',
  reserva_semestral: 'Semestral',
  reserva_individual: 'Reserva',
};

export interface OcupacionAgenda {
  origen: OrigenOcupacion;
  id: string;
  hora_inicio: string;
  hora_fin: string;
  titulo: string;
}

export interface DisponibilidadSalonAgenda {
  salon_id: string;
  ocupaciones: OcupacionAgenda[];
}

export interface ErrorDetalleDto {
  detail: string;
}

/** `HH:MM:SS` (o `HH:MM`) -> `HH:MM`. Copia de `disponibilidad.models.ts`. */
export function formatearHora(hora: string): string {
  const partes = /^(\d{2}):(\d{2})/.exec(hora);
  return partes ? `${partes[1]}:${partes[2]}` : hora;
}
