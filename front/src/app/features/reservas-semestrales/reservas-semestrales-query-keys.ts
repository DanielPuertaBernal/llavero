/**
 * Claves de TanStack Query de la feature `reservas-semestrales`,
 * centralizadas acá igual que en `reservas` y el resto de features.
 *
 * A diferencia de `reservasQueryKeys` (feature hermana), acá NO hay
 * `porSolicitante`: el controller de `reservas_semestrales` no expone
 * `GET /solicitante/{id}` — `service.listar_por_solicitante` existe en el
 * backend pero solo para consumo INTERNO del módulo `nfc` (ver el docstring
 * de back/reservas_semestrales/controller.py, revisado línea por línea: los
 * únicos endpoints de listado son `GET /` y `GET /grupo/{grupo_id}`). No se
 * inventa acá una clave para un filtro que no existe vía HTTP.
 *
 * En cambio SÍ hay `porGrupo(grupoId)`: `GET /grupo/{grupo_id}` es un
 * endpoint real, propio, que trae solo las franjas de un grupo — lo consume
 * el diálogo de cancelación para mostrar exactamente qué franjas se van a
 * eliminar antes de confirmar.
 *
 * `lista` y `porGrupo` cuelgan de `raiz`: crear o cancelar un grupo cambia
 * ambas vistas (la lista completa y, si aplica, la del grupo tocado), y una
 * sola invalidación por prefijo (ver `ReservasSemestralesService.invalidar`)
 * refresca las dos.
 *
 * Los tres lookups (personas, salones, semestres) NO cuelgan de `raiz`: son
 * datos de otros módulos del backend que una mutación de esta feature nunca
 * invalida.
 */
export const reservasSemestralesQueryKeys = {
  raiz: ['reservas-semestrales'] as const,
  lista: ['reservas-semestrales', 'lista'] as const,
  porGrupo: (grupoId: string) => ['reservas-semestrales', 'grupo', grupoId] as const,
  lookupPersonas: ['reservas-semestrales-lookups', 'personas'] as const,
  lookupSalones: ['reservas-semestrales-lookups', 'salones'] as const,
  lookupSemestres: ['reservas-semestrales-lookups', 'semestres'] as const,
};
