// Formas de request/response de los endpoints `/api/llaves/*` (Django
// Ninja, ver back/llaves/controller.py) consumidas por esta feature —
// nombres de campo verificados 1:1 contra los schemas `LlaveOut`/`LlaveIn`/
// `DevolverLlaveIn` del controller (no adivinados).
//
// Igual que en `features/catalogos` (ver catalogos.models.ts): las
// interfaces se consumen tal cual dentro de la propia feature, sin capa
// pública que esconder detrás de un mapeo, así que se mantiene el nombre de
// campo exacto que viaja por HTTP (snake_case) en vez de duplicar cada
// forma en una versión camelCase sin necesidad real.
//
// Nota de alcance — `Llave` NO es un CRUD: el backend expone solo
// `GET /`, `GET /{id}`, `GET /estado/{estado}`,
// `GET /docente-titular/{id}`, `POST /` y `POST /{id}/devolver`. No hay
// PATCH ni DELETE (ver back/llaves/controller.py): una llave es un evento
// de ciclo de vida (entrega -> devolución), no una fila editable. Por eso
// acá no existe un tipo `LlavePatch`/`Partial<LlaveInput>`.
//
// Nota de duplicación deliberada — `ErrorDetalleDto` y los tipos de lookup
// (`SalonLookup`, `PersonaLookup`, ...) se declaran acá aunque formas
// parecidas ya existan en `features/catalogos`: la regla dura del proyecto
// (ver front/README.md y DOC/4.3 Diagrama de Paquetes.md) es que ninguna
// feature importa código de otra feature, solo de `core/`. Consumir el
// endpoint HTTP de otro módulo del backend sí está permitido (es una API
// pública); importar el TypeScript de otra feature no.

export interface ErrorDetalleDto {
  detail: string;
}

// Valores exactos de `EstadoLlave`/`OrigenLlave`/`TipoEntregaLlave`
// (`models.TextChoices` en back/llaves/model.py). Se modelan como uniones
// de literales de string en vez de `enum` de TypeScript porque lo que viaja
// por HTTP es el string crudo: la unión da el mismo chequeo en compilación
// sin agregar un objeto en runtime.
export type EstadoLlave = 'en_prestamo' | 'demora_entrega' | 'entregado';

export type OrigenLlave = 'programacion' | 'reserva_semestral' | 'reserva_individual' | 'manual';

export type TipoEntregaLlave = 'credencial' | 'manual';

// Etiquetas para la UI: son las mismas del segundo elemento de cada
// `TextChoices` del backend (ej. `EN_PRESTAMO = "en_prestamo", "En
// préstamo"`), no traducciones inventadas acá.
export const ETIQUETAS_ESTADO_LLAVE: Record<EstadoLlave, string> = {
  en_prestamo: 'En préstamo',
  demora_entrega: 'Demora en la entrega',
  entregado: 'Entregado',
};

export const ETIQUETAS_ORIGEN_LLAVE: Record<OrigenLlave, string> = {
  programacion: 'Programación',
  reserva_semestral: 'Reserva semestral',
  reserva_individual: 'Reserva individual',
  manual: 'Manual',
};

export const ETIQUETAS_TIPO_ENTREGA_LLAVE: Record<TipoEntregaLlave, string> = {
  credencial: 'Credencial',
  manual: 'Manual',
};

/**
 * Forma que consume `p-select` de PrimeNG (`optionLabel="label"`,
 * `optionValue="value"`). Las listas de opciones de los tres enums se
 * derivan de los mapas de etiquetas de arriba en vez de escribirse a mano:
 * agregar un valor al enum del backend y su etiqueta acá es suficiente para
 * que aparezca en los tres selectores de la feature.
 */
export interface OpcionSelect<T extends string> {
  label: string;
  value: T;
}

function opcionesDesdeEtiquetas<T extends string>(etiquetas: Record<T, string>): OpcionSelect<T>[] {
  return (Object.entries(etiquetas) as [T, string][]).map(([value, label]) => ({ label, value }));
}

export const OPCIONES_ESTADO_LLAVE = opcionesDesdeEtiquetas(ETIQUETAS_ESTADO_LLAVE);
export const OPCIONES_ORIGEN_LLAVE = opcionesDesdeEtiquetas(ETIQUETAS_ORIGEN_LLAVE);
export const OPCIONES_TIPO_ENTREGA_LLAVE = opcionesDesdeEtiquetas(ETIQUETAS_TIPO_ENTREGA_LLAVE);

export interface Llave {
  id: string;
  salon_id: string;
  docente_titular_id: string;
  reclamado_por_id: string;
  origen: OrigenLlave;
  tipo_entrega: TipoEntregaLlave;
  tipo_devolucion: TipoEntregaLlave | null;
  usuario_entrega_id: string;
  usuario_recibe_id: string | null;
  ubicacion_entrega_id: string;
  ubicacion_devolucion_id: string | null;
  novedad_id: string | null;
  fecha_hora_entrega: string;
  fecha_hora_devolucion: string | null;
  estado: EstadoLlave;
}

// `LlaveIn` del controller. `estado` y `fecha_hora_entrega` NO se envían:
// los fija el backend (`auto_now_add` y el estado inicial del ciclo de
// vida, ver back/llaves/service.py).
//
// `reserva_id` es opcional y solo válido junto con
// `origen === 'reserva_individual'`; enviarlo con cualquier otro origen
// hace que el backend responda 400. Por eso el diálogo de entrega lo omite
// del payload en vez de mandarlo en `null`.
export interface LlaveInput {
  salon_id: string;
  docente_titular_id: string;
  reclamado_por_id: string;
  origen: OrigenLlave;
  tipo_entrega: TipoEntregaLlave;
  usuario_entrega_id: string;
  ubicacion_entrega_id: string;
  reserva_id?: string | null;
}

// `DevolverLlaveIn` del controller: el cuerpo de `POST
// /api/llaves/{id}/devolver`. `novedad_id` es nullable de verdad (una
// devolución sin novedad manda `null` explícito, no se omite la clave).
export interface DevolucionInput {
  usuario_recibe_id: string;
  ubicacion_devolucion_id: string;
  tipo_devolucion: TipoEntregaLlave;
  novedad_id?: string | null;
}

// ------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------
//
// Las 7 FKs de `Llave` viajan como UUID crudo, sin nombres denormalizados
// (ver `LlaveOut`): la feature resuelve cada id a un nombre legible
// consultando los endpoints de los módulos dueños. Cada tipo declara solo
// los campos que esta feature realmente renderiza — no la forma completa
// del `*Out` del backend.

// `SalonOut` de back/catalogos/controller.py (solo `id`/`nombre`: la
// silletería y los conteos no se muestran acá).
export interface SalonLookup {
  id: string;
  nombre: string;
}

// `UbicacionOut` de back/catalogos/controller.py. Los dos flags de permiso
// se traen para ORDENAR/ETIQUETAR las opciones (las ubicaciones que sí
// permiten la operación aparecen primero), nunca para bloquear el envío:
// la regla de negocio la valida el backend y su 400 se muestra tal cual
// (ver llaves-error.util.ts). `permite_prestamo_equipos` no se trae: no lo
// usa ninguna vista de esta feature.
export interface UbicacionLookup {
  id: string;
  nombre: string;
  permite_prestamo_llaves: boolean;
  permite_devolucion_llaves: boolean;
}

// `ComunidadOut` de back/comunidad/controller.py: personas (docente
// titular / quien reclama la llave). `numero_documento` acompaña al nombre
// en el selector para desambiguar homónimos.
export interface PersonaLookup {
  id: string;
  nombre: string;
  numero_documento: string;
}

// `UsuarioOut` de back/usuarios/controller.py: quien entrega/recibe la
// llave en la ventanilla. `activo` se trae para poder marcar los usuarios
// desactivados en el selector.
export interface UsuarioLookup {
  id: string;
  nombre: string;
  activo: boolean;
}

// `NovedadOut` de back/novedades/controller.py: la novedad opcional que se
// asocia a una devolución.
export interface NovedadLookup {
  id: string;
  categoria: string;
  descripcion: string | null;
}
