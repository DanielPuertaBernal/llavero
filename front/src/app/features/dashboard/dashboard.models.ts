// Formas mínimas de los endpoints que este panel de resumen combina — cada
// una es un subconjunto de los `*Out` reales de su módulo dueño (mismo
// criterio que `historial.models.ts`/`reservas-lookups.service.ts`: solo se
// declaran los campos que esta feature realmente usa, nunca la forma
// completa del backend).
//
// Nota de alcance — Dashboard es la feature Nº14 y la ÚLTIMA de solo
// LECTURA (mismo espíritu que `disponibilidad`/`comunidad`/`historial`): no
// hay ningún endpoint propio en el backend (no existe `back/dashboard/`).
// Combina, client-side, los `GET /` ya expuestos por `llaves`, `prestamos`,
// `novedades`, `notificaciones`, `reservas` e `historial` — los seis
// endpoints ya alcanzan para las 5 tarjetas KPI + la actividad reciente, así
// que no se justifica un módulo agregador nuevo en el backend (a diferencia
// de `disponibilidad`/`historial`, que SÍ combinan varias tablas dentro del
// propio backend porque el cruce -- superposición de franjas, transiciones
// de otros módulos -- no es expresable con un simple conteo client-side).
//
// Cada tipo trae también su propio `ErrorDetalleDto` (duplicado a propósito,
// igual que en el resto de features: ninguna feature importa código de
// otra, regla dura de `front/README.md`).

export interface ErrorDetalleDto {
  detail: string;
}

// `LlaveOut` de back/llaves/controller.py — solo `estado` importa aquí (KPI
// "Llaves fuera"): cualquier valor distinto de `entregado` cuenta como
// llave todavía fuera (en préstamo o en demora, ver `EstadoLlave` en
// back/llaves/model.py).
export type EstadoLlave = 'en_prestamo' | 'demora_entrega' | 'entregado';

export interface LlaveResumen {
  estado: EstadoLlave;
}

// `PrestamoOut` de back/prestamos/controller.py — KPI "Préstamos activos":
// activo o parcialmente devuelto cuenta como abierto (ver `EstadoPrestamo`
// en back/prestamos/model.py); completamente devuelto no.
export type EstadoPrestamo = 'activo' | 'parcialmente_devuelto' | 'completamente_devuelto';

export interface PrestamoResumen {
  estado: EstadoPrestamo;
}

// `NovedadOut` de back/novedades/controller.py — KPI "Novedades abiertas".
export type EstadoNovedad = 'abierta' | 'cerrada';

export interface NovedadResumen {
  estado: EstadoNovedad;
}

// `NotificacionOut` de back/notificaciones/controller.py — KPI
// "Notificaciones fallidas".
export type EstadoEnvioNotificacion = 'enviado' | 'fallido';

export interface NotificacionResumen {
  estado_envio: EstadoEnvioNotificacion;
}

// `ReservaIndividualOut` de back/reservas/controller.py — KPI "Reservas de
// hoy": aprobadas cuya `fecha` es la fecha local de hoy.
export type EstadoReservaIndividual = 'aprobada' | 'cancelada' | 'completada' | 'no_reclamada';

export interface ReservaResumen {
  fecha: string;
  estado: EstadoReservaIndividual;
}

// `EventoHistorial` de back/historial/controller.py — igual que
// `historial.models.ts`, la fila es HETEROGÉNEA según `tipo_recurso`; aquí
// solo se muestran los campos comunes de "actividad reciente" (sin
// resolver todos los detalles por tipo — esa resolución completa ya vive en
// la vista de Historial, a la que este panel enlaza).
export type TipoRecurso = 'llave' | 'equipo';
export type TipoEvento = 'entrega' | 'devolucion';

export interface EventoRecienteDto {
  tipo_recurso: TipoRecurso;
  tipo_evento: TipoEvento;
  procesado_por_id: string;
  fecha_hora: string;
}

// `UsuarioOut` de back/usuarios/controller.py — quien procesó cada evento
// de la actividad reciente. Solo se trae `id` y `nombre` (mismo recorte que
// `historial.models.ts`).
export interface UsuarioLookup {
  id: string;
  nombre: string;
}
