// Formas de request/response de los endpoints `/api/prestamos/*` (Django
// Ninja, ver back/prestamos/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `PrestamoOut`,
// `DetallePrestamoOut`, `DevolucionOut`, `PrestamoIn` y `DevolverEquiposIn`
// del controller (no adivinados).
//
// Igual que en `features/catalogos` y `features/llaves`: las interfaces se
// consumen tal cual dentro de la propia feature, sin capa pública que
// esconder detrás de un mapeo, así que se mantiene el nombre de campo
// exacto que viaja por HTTP (snake_case) en vez de duplicar cada forma en
// una versión camelCase sin necesidad real.
//
// Nota de alcance — `Prestamo` NO es un CRUD: el backend expone solo
// `GET /`, `GET /{id}`, `GET /estado/{estado}`, `GET /solicitante/{id}`,
// `GET /{id}/detalles`, `GET /{id}/devoluciones`, `POST /` y
// `POST /{id}/devolver`. No hay PATCH ni DELETE (ver
// back/prestamos/controller.py): un préstamo es un evento de ciclo de vida
// (entrega de N equipos -> devoluciones parciales -> devolución completa),
// no una fila editable. Por eso acá no existe un tipo
// `PrestamoPatch`/`Partial<PrestamoInput>`.
//
// Nota de duplicación deliberada — `ErrorDetalleDto` y los tipos de lookup
// (`PersonaLookup`, `UsuarioLookup`, ...) se declaran acá aunque formas
// parecidas ya existan en `features/catalogos` y `features/llaves`: la regla
// dura del proyecto (ver front/README.md y DOC/4.3 Diagrama de Paquetes.md)
// es que ninguna feature importa código de otra feature, solo de `core/`.
// Consumir el endpoint HTTP de otro módulo del backend sí está permitido (es
// una API pública); importar el TypeScript de otra feature no.

export interface ErrorDetalleDto {
  detail: string;
}

// Valores exactos de `EstadoPrestamo`/`EstadoDetalleEquipo`
// (`models.TextChoices` en back/prestamos/model.py) y de `EstadoEquipo`
// (back/equipos/model.py). Se modelan como uniones de literales de string en
// vez de `enum` de TypeScript porque lo que viaja por HTTP es el string
// crudo: la unión da el mismo chequeo en compilación sin agregar un objeto
// en runtime.
export type EstadoPrestamo = 'activo' | 'parcialmente_devuelto' | 'completamente_devuelto';

export type EstadoDetalleEquipo = 'entregado' | 'devuelto';

export type EstadoEquipo = 'activo' | 'inactivo';

// Etiquetas para la UI: son las mismas del segundo elemento de cada
// `TextChoices` del backend (ej. `PARCIALMENTE_DEVUELTO =
// "parcialmente_devuelto", "Parcialmente devuelto"`), no traducciones
// inventadas acá.
export const ETIQUETAS_ESTADO_PRESTAMO: Record<EstadoPrestamo, string> = {
  activo: 'Activo',
  parcialmente_devuelto: 'Parcialmente devuelto',
  completamente_devuelto: 'Completamente devuelto',
};

export const ETIQUETAS_ESTADO_DETALLE_EQUIPO: Record<EstadoDetalleEquipo, string> = {
  entregado: 'Entregado',
  devuelto: 'Devuelto',
};

export const ETIQUETAS_ESTADO_EQUIPO: Record<EstadoEquipo, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
};

/**
 * Forma que consumen `mat-select` (single) y `mat-select [multiple]` de
 * Angular Material (`mat-option [value]`). Las listas de opciones de
 * los enums se derivan de los mapas de etiquetas de arriba en vez de
 * escribirse a mano: agregar un valor al enum del backend y su etiqueta acá
 * es suficiente para que aparezca en los selectores de la feature.
 */
export interface OpcionSelect<T extends string> {
  label: string;
  value: T;
}

function opcionesDesdeEtiquetas<T extends string>(etiquetas: Record<T, string>): OpcionSelect<T>[] {
  return (Object.entries(etiquetas) as [T, string][]).map(([value, label]) => ({ label, value }));
}

export const OPCIONES_ESTADO_PRESTAMO = opcionesDesdeEtiquetas(ETIQUETAS_ESTADO_PRESTAMO);
export const OPCIONES_ESTADO_DETALLE_EQUIPO = opcionesDesdeEtiquetas(
  ETIQUETAS_ESTADO_DETALLE_EQUIPO,
);
export const OPCIONES_ESTADO_EQUIPO = opcionesDesdeEtiquetas(ETIQUETAS_ESTADO_EQUIPO);

// `PrestamoOut` del controller. `estado` y `fecha_creacion` los fija el
// backend (estado inicial del ciclo de vida y `auto_now_add`), por eso no
// aparecen en `PrestamoInput`.
export interface Prestamo {
  id: string;
  solicitante_id: string;
  usuario_prestamista_id: string;
  ubicacion_id: string;
  estado: EstadoPrestamo;
  fecha_creacion: string;
}

// `DetallePrestamoOut`: una fila por equipo entregado dentro del préstamo.
// `estado_equipo` es el que decide si ese equipo todavía se puede devolver
// (`entregado`) o ya se devolvió (`devuelto`), y `novedad_id` queda con la
// novedad que se registró al devolverlo, si hubo alguna.
export interface DetallePrestamo {
  id: string;
  prestamo_id: string;
  equipo_id: string;
  novedad_id: string | null;
  estado_equipo: EstadoDetalleEquipo;
  fecha_entrega: string;
  fecha_devolucion: string | null;
}

// `DevolucionOut`: un préstamo puede tener VARIAS devoluciones (parciales)
// hasta que `es_completa` marca la que cerró el ciclo.
export interface Devolucion {
  id: string;
  prestamo_id: string;
  usuario_recibe_id: string;
  ubicacion_id: string;
  fecha: string;
  es_completa: boolean;
}

// `PrestamoIn` del controller: el cuerpo de `POST /api/prestamos/`.
// `equipo_ids` no puede ir vacío — el backend responde 400. El formulario lo
// exige antes de enviar (con `Validators.required` sobre el multiselect),
// pero NO replica el resto de las reglas: si la ubicación no permite
// préstamo de equipos, o si alguno de los equipos ya está entregado en otro
// préstamo activo, eso lo decide el backend (ver prestamos-error.util.ts).
export interface PrestamoInput {
  solicitante_id: string;
  usuario_prestamista_id: string;
  ubicacion_id: string;
  equipo_ids: string[];
}

// `DevolverEquiposIn` del controller: el cuerpo de
// `POST /api/prestamos/{id}/devolver`.
//
// `novedades_por_equipo` mapea `equipo_id -> novedad_id` y es OPCIONAL de
// verdad (`dict[uuid, uuid] | None = None` en el schema): cuando ningún
// equipo tiene novedad, la clave se OMITE del payload en vez de mandar un
// objeto vacío — un `{}` diría "hay un mapa, está vacío", que no es lo
// mismo que "no hay novedades" y depende de que el backend trate ambos
// casos igual. Solo se incluyen los equipos que sí tienen novedad elegida.
export interface DevolucionInput {
  usuario_recibe_id: string;
  ubicacion_id: string;
  equipo_ids: string[];
  novedades_por_equipo?: Record<string, string>;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// Las FKs de `Prestamo`/`DetallePrestamo`/`Devolucion` viajan como UUID
// crudo, sin nombres denormalizados: la feature resuelve cada id a un nombre
// legible consultando los endpoints de los módulos dueños. Cada tipo declara
// solo los campos que esta feature realmente renderiza — no la forma
// completa del `*Out` del backend.

// `ComunidadOut` de back/comunidad/controller.py: la persona que solicita el
// préstamo. `numero_documento` acompaña al nombre en el selector para
// desambiguar homónimos.
export interface PersonaLookup {
  id: string;
  nombre: string;
  numero_documento: string;
}

// `UsuarioOut` de back/usuarios/controller.py: quien presta o quien recibe
// los equipos en la ventanilla. `activo` se trae para poder marcar los
// usuarios desactivados en el selector.
export interface UsuarioLookup {
  id: string;
  nombre: string;
  activo: boolean;
}

// `UbicacionOut` de back/catalogos/controller.py. `permite_prestamo_equipos`
// se trae para ORDENAR las opciones del selector de préstamo (las que sí lo
// permiten aparecen primero), nunca para bloquear el envío: la regla de
// negocio la valida el backend y su 400 se muestra tal cual (ver
// prestamos-error.util.ts). Los dos flags de llaves no se traen: no los usa
// ninguna vista de esta feature.
export interface UbicacionLookup {
  id: string;
  nombre: string;
  permite_prestamo_equipos: boolean;
}

// `EquipoOut` de back/equipos/controller.py. `codigo_inventario` acompaña al
// nombre en las etiquetas (dos equipos del mismo modelo comparten nombre) y
// `estado` solo se usa para MARCAR los inactivos, nunca para excluirlos: no
// existe endpoint que diga qué equipos están libres, así que el cliente no
// puede — ni debe — anticipar la disponibilidad.
export interface EquipoLookup {
  id: string;
  nombre: string;
  codigo_inventario: string;
  estado: EstadoEquipo;
}

// `NovedadOut` de back/novedades/controller.py: la novedad opcional que se
// asocia a un equipo dentro de una devolución.
export interface NovedadLookup {
  id: string;
  categoria: string;
  descripcion: string | null;
}
