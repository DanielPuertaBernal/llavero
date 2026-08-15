# core/shared

Envoltorios propios reutilizables sobre Angular Material + SweetAlert2 (ver
`DOC/5. Identidad Visual/Mockups/00-especificacion-visual.md`, sección
"Librerías de UI" — PrimeNG se retiró por licencia, no hay theming propio
que reemplazar componente por componente).

- `NotificationService` — reemplaza `MessageService` de PrimeNG. Toasts
  SweetAlert2 con los 4 niveles de severidad ya usados en el código
  (`success`/`info`/`warn`/`error`), coloreados con la paleta institucional.
- `ConfirmService` — reemplaza `ConfirmationService` de PrimeNG. Confirma
  con `Swal.fire(...)`, devuelve `Promise<boolean>` en vez del patrón de
  callbacks `accept`/`reject`.
- `MoraGaugeComponent` (`<app-mora-gauge>`) — medidor circular 0-100% del
  tiempo transcurrido hacia la mora de un préstamo/llave, verde→amarillo→
  naranja. Documentado como pendiente en
  `AulaSync/analisis/estrategia-migracion/frontend.md` para resolverse con
  `p-knob` de PrimeNG; al no tener PrimeNG, se resuelve con un `<svg>`
  propio (mismo criterio original: "sin librería adicional").
- `SkeletonComponent` (`<app-skeleton variant="row|card|text">`) — placeholder
  de carga reutilizable (patrón `animate-pulse`, resuelto con `@keyframes`
  propio), gris de superficie institucional + radios de
  `core/theme/_elevation.scss`. Parte del uplift de diseño estructural (ver
  `00-especificacion-visual.md`, sección "Estado de carga (skeleton)").

Pendiente, mismo criterio de Core que antes (solo sube lo ya duplicado o se
sabe compartido):

- El campo de lectura de credencial (NFC/carnet) con foco automático,
  compartido hoy de forma duplicada en 4 páginas del sistema legacy
  (`PrestamosPage`, `MonitoresPage`, `ReservasPage`, `ReservasSemestralesPage`
  — ver `AulaSync/analisis/estrategia-migracion/frontend.md`).
