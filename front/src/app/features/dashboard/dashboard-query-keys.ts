/**
 * Claves de TanStack Query de la feature `dashboard`, centralizadas aquí
 * igual que en `historial`/`comunidad`/`reservas` (ver sus
 * `*-query-keys.ts`).
 *
 * Feature de SOLO LECTURA (ver la nota de alcance en `dashboard.models.ts`):
 * no hay mutaciones, así que no hay ningún `invalidar()` público -- cada
 * clave se comparte a propósito con la de la feature dueña del recurso
 * cuando aplica un mismo `GET /` sin filtro (`llaves`, `prestamos`,
 * `novedades`, `notificaciones`, `reservas`), para que una mutación hecha
 * en esa OTRA feature (p. ej. devolver una llave en `/llaves`) invalide
 * también el KPI de este panel la próxima vez que TanStack revalide -- sin
 * que `dashboard` necesite su propio `invalidar()` ni conocer las
 * mutaciones de esas features.
 *
 * `actividadReciente`/`rolActual`/`lookupUsuarios` sí son exclusivas de este
 * panel (mismo criterio que `historialQueryKeys.lista`/`rolActual`/
 * `lookupUsuarios`): la actividad reciente reusa el mismo endpoint
 * `GET /api/historial/` pero es una vista recortada (últimos N eventos),
 * así que cuelga de su propia clave en vez de la de `historial`.
 *
 * Las claves `lista` de abajo son literales IDÉNTICAS a
 * `llavesQueryKeys.lista`/`prestamosQueryKeys.lista`/`novedadesQueryKeys.
 * lista`/`notificacionesQueryKeys.lista`/`reservasQueryKeys.lista` a
 * propósito (comparadas por valor, no por referencia, que es como TanStack
 * Query identifica una entrada de caché) -- así el KPI de este panel
 * reutiliza la MISMA entrada de caché que ya haya poblado la vista de esa
 * feature (sin refetch si el usuario ya visitó `/llaves` en esta sesión) y
 * se refresca solo cuando esa feature invalida su `raiz` tras una mutación,
 * sin que `dashboard` necesite su propio `invalidar()`. Si el nombre de
 * alguna de esas claves cambia en su feature dueña, esta constante debe
 * actualizarse junto con ella.
 */
export const dashboardQueryKeys = {
  llaves: ['llaves', 'lista'] as const,
  prestamos: ['prestamos', 'lista'] as const,
  novedades: ['novedades', 'lista'] as const,
  notificaciones: ['notificaciones', 'lista'] as const,
  reservas: ['reservas', 'lista'] as const,
  actividadReciente: (usuarioIdFiltro: string | null) =>
    ['dashboard', 'actividad-reciente', usuarioIdFiltro] as const,
  rolActual: (rolId: string | null) => ['dashboard-rol-actual', rolId] as const,
  lookupUsuarios: ['dashboard-lookups', 'usuarios'] as const,
};
