# 00 — Especificación visual de los mockups (draw.io)

Fuente de verdad para todos los archivos `.drawio` de esta carpeta. Cualquier
mockup nuevo (pantalla, sección, componente) debe reusar EXACTAMENTE estos
estilos — no inventar variantes nuevas de color/tipografía por archivo.

Basado en `../5.1 Manual de Marca UCO.md`. Tema **claro** (fondo blanco/gris
claro), no oscuro — decisión explícita: el frontend usaba el tema oscuro por
defecto de PrimeNG sin ninguna personalización real más allá del color
primario del botón; estos mockups definen cómo debería verse con identidad
UCO real.

**Librería de UI (actualizado):** PrimeNG se retiró del proyecto por
licencia. El frontend usa **Angular Material** (tema M3, tokens de color
sobreescritos con el HEX exacto de esta paleta en `front/src/styles.scss`,
tipografía Montserrat/Poppins) + **SweetAlert2** para notificaciones toast y
confirmaciones (`core/shared/notification.service.ts` y
`core/shared/confirm.service.ts`, ver `core/shared/README.md`). Los valores
de esta spec (HEX, tipografía, layout) son agnósticos de framework — no
cambia nada del contenido de abajo por el cambio de librería, solo el
componente concreto que lo implementa (ej. "Select/dropdown" → `mat-select`
en vez de `p-select`).

## Paleta

| Uso | Color | HEX |
|---|---|---|
| Primario (acciones, sidebar activo) | Verde institucional | `#008b50` |
| Acento (highlights, indicador activo) | Amarillo institucional | `#ffca00` |
| Texto sobre fondo claro | Gris casi negro | `#1a1a1a` |
| Texto secundario | Gris medio | `#6b7280` |
| Fondo de página | Blanco | `#ffffff` |
| Fondo de sidebar | Verde institucional | `#008b50` |
| Fondo de superficie/tarjeta | Gris muy claro | `#f5f7f6` |
| Borde/separador | Gris claro | `#e2e5e4` |
| Estado éxito/completado | Verde institucional | `#008b50` |
| Estado info/activo | Turquesa | `#04b5ac` |
| Estado atención/pendiente | Amarillo institucional | `#ffca00` |
| Estado peligro/mora | Naranja | `#e28210` |
| Estado neutro/cancelado | Azul | `#1d3475` |

Nunca usar negro puro (`#000000`) como fondo de ninguna superficie grande —
el pedido explícito fue alejarse del tema oscuro actual.

## Tipografía (rotulado en los mockups)

- Títulos/encabezados: **Montserrat**, bold.
- Texto general/cuerpo: **Montserrat**, regular.
- Texto que se quiere resaltar (badges, CTAs): **Poppins**, semibold.

En draw.io: `fontFamily=Montserrat;` o `fontFamily=Poppins;` en el `style=`
de cada `mxCell` de texto.

## Estilos reutilizables (copiar el `style=` literal)

**Sidebar — contenedor:**
```
rounded=0;whiteSpace=wrap;html=1;fillColor=#008b50;strokeColor=none;fontColor=#ffffff;
```

**Sidebar — encabezado de sección** (ej. "GESTIÓN DE LLAVES"):
```
text;html=1;align=left;verticalAlign=middle;fontFamily=Montserrat;fontSize=11;fontColor=#ffca00;fontStyle=1;spacingLeft=16;
```

**Sidebar — ítem (inactivo):**
```
text;html=1;align=left;verticalAlign=middle;fontFamily=Montserrat;fontSize=13;fontColor=#ffffff;spacingLeft=28;
```

**Sidebar — ítem (activo/ruta actual):**
```
rounded=6;whiteSpace=wrap;html=1;fillColor=#ffca00;strokeColor=none;fontColor=#024426;fontFamily=Montserrat;fontSize=13;fontStyle=1;align=left;spacingLeft=28;
```

**Sidebar — botón colapsar/expandir** (icono `<<`/`>>` en la esquina):
```
rounded=20;whiteSpace=wrap;html=1;fillColor=#024426;strokeColor=none;fontColor=#ffffff;fontSize=12;
```

**Header de página (barra superior del área de contenido):**
```
rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#e2e5e4;strokeWidth=1;
```

**Título de página (`<h1>` visual):**
```
text;html=1;align=left;verticalAlign=middle;fontFamily=Montserrat;fontSize=22;fontStyle=1;fontColor=#1a1a1a;
```

**Botón primario** (ej. "Registrar reserva semestral"):
```
rounded=6;whiteSpace=wrap;html=1;fillColor=#008b50;strokeColor=none;fontColor=#ffffff;fontFamily=Poppins;fontSize=13;fontStyle=1;
```

**Botón secundario:**
```
rounded=6;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#008b50;strokeWidth=1;fontColor=#008b50;fontFamily=Poppins;fontSize=13;
```

**Botón de peligro/acción irreversible** (ej. "Cerrar novedad", "Desactivar usuario"):
```
rounded=6;whiteSpace=wrap;html=1;fillColor=#e28210;strokeColor=none;fontColor=#ffffff;fontFamily=Poppins;fontSize=13;fontStyle=1;
```

**Input de búsqueda/texto:**
```
rounded=6;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#e2e5e4;strokeWidth=1;fontFamily=Montserrat;fontSize=13;fontColor=#6b7280;align=left;spacingLeft=10;
```

**Select/dropdown** (mismo estilo que el input + indicador `▾` al final del texto):
```
rounded=6;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#e2e5e4;strokeWidth=1;fontFamily=Montserrat;fontSize=13;fontColor=#1a1a1a;align=left;spacingLeft=10;
```

**Tabla — fila de encabezado:**
```
rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f7f6;strokeColor=#e2e5e4;strokeWidth=1;fontFamily=Montserrat;fontSize=12;fontStyle=1;fontColor=#1a1a1a;align=left;spacingLeft=10;
```

**Tabla — fila de datos:**
```
rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#e2e5e4;strokeWidth=1;fontFamily=Montserrat;fontSize=13;fontColor=#1a1a1a;align=left;spacingLeft=10;
```

**Tabla — mensaje de estado vacío** (texto centrado, gris, dentro de una fila):
```
text;html=1;align=center;verticalAlign=middle;fontFamily=Montserrat;fontSize=13;fontColor=#6b7280;fontStyle=2;
```

**Badge de estado** (usar el color de la tabla de estados de arriba según corresponda; forma píldora):
```
rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#008b50;strokeColor=none;fontColor=#ffffff;fontFamily=Poppins;fontSize=11;fontStyle=1;
```

**Tarjeta KPI** (dashboard):
```
rounded=10;whiteSpace=wrap;html=1;fillColor=#f5f7f6;strokeColor=#e2e5e4;strokeWidth=1;
```

**Tarjeta KPI — valor numérico grande:**
```
text;html=1;align=left;verticalAlign=middle;fontFamily=Montserrat;fontSize=32;fontStyle=1;fontColor=#008b50;
```

**Diálogo/modal — overlay** (rectángulo semitransparente cubriendo toda la pantalla, detrás del diálogo):
```
rounded=0;whiteSpace=wrap;html=1;fillColor=#1a1a1a;strokeColor=none;opacity=40;
```

**Diálogo/modal — panel:**
```
rounded=10;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=none;shadow=1;
```

**Diálogo/modal — header:**
```
text;html=1;align=left;verticalAlign=middle;fontFamily=Montserrat;fontSize=18;fontStyle=1;fontColor=#1a1a1a;
```

**Label de campo de formulario:**
```
text;html=1;align=left;verticalAlign=middle;fontFamily=Montserrat;fontSize=12;fontColor=#6b7280;
```

## Estructura de layout estándar (todas las pantallas autenticadas)

Canvas de referencia: **1440 × 900px**.

- **Sidebar**: `x=0, y=0, width=260, height=900` (estado expandido). Versión
  colapsada (solo íconos): `width=72`. El botón de colapsar/expandir va en
  la esquina superior derecha del sidebar.
- **Header de página**: `x=260, y=0, width=1180, height=72`.
- **Área de contenido**: `x=260, y=72, width=1180, height=828`, fondo
  `#ffffff`, padding visual de 32px en los mockups (dejar ese margen al
  ubicar tablas/tarjetas dentro).

## Secciones del sidebar (agrupación por dominio, reemplaza el menú horizontal plano actual)

El shell (`front/src/app/core/shell/shell.component.ts`) ya implementa esta
agrupación con `mat-sidenav` vertical colapsable (el `p-menubar` horizontal
plano que tenía antes quedó reemplazado):

- **Dashboard** (ítem suelto, sin sección, primero)
- **Gestión de llaves**: Llaves, Préstamos, Disponibilidad
- **Reservas**: Reservas, Reservas Semestrales
- **Catálogos**: Salones, Ubicaciones, Bloques, Tipos de Silletería (no hay Roles/Tipos de Persona como vista propia, ver tabla de archivos abajo)
- **Personas**: Usuarios, Comunidad, Monitores
- **Seguimiento**: Novedades, Notificaciones, Historial
- **Sistema**: Configuración

Al final del sidebar (parte inferior, separado): nombre del usuario logueado
+ botón "Cerrar sesión" (reemplaza el actual `Cerrar sesión` en la esquina
superior derecha).

## Uplift estructural (radios, elevación, transiciones)

Patrones estructurales reconciliados desde AulaSync (React/Tailwind) —
**solo forma** (radios, sombras, tiempos), nunca color; los HEX siguen
saliendo exclusivamente de la tabla de Paleta de arriba. Implementado como
custom properties CSS en `front/src/app/core/theme/_elevation.scss`
(mismo patrón que `_spacing.scss`), importado desde `front/src/styles.scss`.

### Radios (`--radius-*`)

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `4px` | Badges, chips |
| `--radius-md` | `8px` | Botones, inputs, form fields |
| `--radius-lg` | `12px` | Tarjetas, diálogos/modales, popups de SweetAlert2 |

### Elevación (`--shadow-*`)

Regla "border-first": las tarjetas en reposo usan **borde de 1px**
(`--border-surface: 1px solid #e2e5e4`), **sin sombra**
(`--shadow-none: none`). La sombra elevada se reserva para superficies
flotantes por encima del contenido (diálogos, popovers, dropdowns, popups
de SweetAlert2):

```
--shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.16);
```

### Botones — escala de altura

| Variante | Altura |
|---|---|
| `sm` (`.uco-btn--sm`) | `32px` |
| Default | `36px` |
| `lg` (`.uco-btn--lg`) | `40px` |

### Transiciones (`--transition-*`)

| Token | Valor | Uso |
|---|---|---|
| `--transition-fast` | `150ms ease` | Hover, cambios de color |
| `--transition-layout` | `300ms ease-in-out` | Cambios de layout (ej. colapso del sidebar) |

### Tipografía — escalón faltante

La escala UCO existente (22px títulos, 13px cuerpo, 12px encabezado de
tabla, 11px badges) no tenía un escalón para texto meta/labels de sección
muy pequeños. Se agrega:

| Token | Valor | Uso |
|---|---|---|
| `--font-size-2xs` | `10px` | Meta-texto mínimo (ej. timestamps secundarios) |
| `--font-size-xs` | `11px` | Labels de sección, texto meta |

### Comportamiento del colapso del sidebar

`front/src/app/core/shell/shell.component.ts` implementa el colapso con
`mat-sidenav`:

- Ancho expandido: `240px`. Ancho colapsado: `68px`
  (la versión colapsada de los mockups `.drawio` usa `72px` — valor de
  referencia visual; la implementación real usa `68px`, valor reconciliado
  del uplift estructural).
- `transition: width var(--transition-layout)` (300ms ease-in-out).
- Colapsado: ítems de navegación quedan solo-ícono, con tooltip
  (`matTooltip` + atributo `title`) mostrando el label completo.
- Los labels de encabezado de sección (ej. "GESTIÓN DE LLAVES") no se
  quitan del DOM al colapsar (evita saltos bruscos): se desvanecen con
  transición de `opacity`/`max-height` y se reemplazan visualmente por un
  divisor delgado (`.shell__grupo-divisor`, línea de 1px).
- El botón de colapsar/expandir y los ítems de navegación usan
  `var(--radius-md)` para sus esquinas redondeadas.

### Estado de carga (skeleton)

`front/src/app/core/shared/skeleton.component.ts` (`<app-skeleton>`) —
placeholder de carga reutilizable (equivalente a `animate-pulse` de
Tailwind), sin librería adicional (mismo criterio que `MoraGaugeComponent`).
Gris de superficie institucional: base `#f5f7f6`, brillo del shimmer
`#e2e5e4`. Variantes vía `@Input variant`:

| Variante | Uso | Radio |
|---|---|---|
| `row` | Fila de tabla | `--radius-sm` |
| `card` | Tarjeta KPI/dashboard | `--radius-lg` |
| `text` | Línea de texto suelta / meta-texto | `--radius-sm` |

### Badges — mapeo de color por estado

Los badges de estado (forma píldora, `border-radius: 9999px` /
`rounded-full`, padding `4px` vertical / `8px` horizontal, tipografía
Poppins semibold, `font-size: 11px`) usan **fondo tenue (tint) del mismo
tono + texto sólido del mismo tono** — nunca los colores crudos de ámbar/
rojo de AulaSync. Mapeo exacto a la tabla de Paleta de arriba:

| Variante | Estado | Texto (HEX) | Fondo tint |
|---|---|---|---|
| `success` | Éxito/completado | `#008b50` | `#008b50` al 12% de opacidad |
| `info` | Info/activo | `#04b5ac` | `#04b5ac` al 12% de opacidad |
| `warning` | Atención/pendiente | `#ffca00` (sobre texto oscuro `#024426` o `#1a1a1a`) | `#ffca00` al 12% de opacidad |
| `danger` | Peligro/mora | `#e28210` | `#e28210` al 12% de opacidad |
| `neutral` | Cancelado | `#1d3475` | `#1d3475` al 12% de opacidad |

## Uplift de layout (título de página, tabla-simple consolidada, skeleton wireado)

Segunda pasada de uplift, más profunda que la de radios/sombras/iconos de
arriba: iba dirigida a resolver que la UI "seguía viéndose fea" incluso con
esos tokens ya aplicados — el problema real era de LAYOUT (cada
`*-list.component.ts` repetía su propio CSS de tabla, sin título de página,
sin hover de fila, sin skeleton), no solo de color/radio.

### Encabezado de página (`.uco-page-header__title`/`__desc`)

Toda vista de lista/detalle en `front/src/app/features/*` arranca ahora con
un `<h1 class="uco-page-header__title">` + `<p class="uco-page-header__desc">`
antes de su propio `<header>` de filtros/acción principal (definidos en
`front/src/styles.scss`, no en cada componente) — mismo patrón que
`ProgramacionPage.jsx` de AulaSync (título + descripción corta + fila de
acciones), que antes faltaba por completo: cada vista arrancaba directo con
la fila de filtros, sin ningún ancla de "en qué pantalla estoy".

### `.tabla-simple` — fuente única de verdad

Antes de este uplift, CADA `*-list.component.ts` (llaves, prestamos,
usuarios, salones, ubicaciones, historial, monitores, notificaciones,
novedades, comunidad, reservas-semestrales, dashboard) declaraba su propia
copia casi idéntica de `.tabla-simple`/`.tabla-simple__estado-vacio` en su
`styles:` inline, con pequeñas inconsistencias de padding
(`10px` vs `var(--space-2) var(--space-3)` vs `0.5rem 0.75rem`) y sin hover
de fila. Se consolidó en `front/src/styles.scss` (una sola definición
global) y se retiró la copia de cada componente. La versión consolidada
agrega:

- Encabezado de tabla en mayúsculas, `letter-spacing: 0.04em`, color
  `#6b7280` sobre fondo `#f5f7f6` (antes: texto negro `#1a1a1a`, sin
  tracking).
- Hover de fila (`background-color: #f5f7f6` con `--transition-fast`) —
  antes las filas no tenían ningún feedback visual al pasar el mouse.
- Borde exterior + radio `--radius-md` en la tabla completa (antes: sin
  borde exterior, cada celda con su propio borde suelto).
- Mismo hover aplicado a `.mat-mdc-table .mat-mdc-row` para la única vista
  que usa `mat-table` real (`reservas-list`), no solo la tabla-simple HTML.

Nota — dos alias de clase de estado vacío (`tabla-simple__estado-vacio` y
`tabla-simple-simple__estado-vacio`, este último por una errata de copia en
`comunidad`/`notificaciones`/`novedades`/dashboard) siguen ambos soportados
en la regla global: no se renombraron en cada componente para no tocar
templates más de lo necesario, pero cualquier vista nueva debe usar el
nombre correcto (`tabla-simple__estado-vacio`, sin duplicar "simple").

### Skeleton wireado

`SkeletonComponent` (`<app-skeleton>`) pasó de "creado pero sin uso real" a
estar wireado en las 3 vistas de mayor tráfico (`llaves-list`,
`prestamos-list`, `reservas-list`) y en el panel de dashboard
(`dashboard-resumen`, tarjetas KPI + tabla de actividad reciente):
reemplaza el texto plano "Cargando..." por `variant="row"` repetido (5
filas, aproximando el conteo real esperado) mientras
`query.isPending()` es verdadero, y `variant="text"`/`variant="card"` en
las tarjetas KPI. El resto de vistas de menor tráfico mantiene el texto
"Cargando..."/"Cargando X…" tal cual — no se wireó ahí para mantener el
alcance acotado, no es una limitación técnica del componente.

## Uplift estructural II (tarjeta de perfil del sidebar, agenda de reserva, tarjetas de programación)

Tercera pasada de uplift, reconciliada contra CAPTURAS REALES de AulaSync
(no descripción, screenshots concretos) que mostraban 3 patrones que
`front/` no tenía. Igual criterio que el uplift de radios/elevación de
arriba: solo estructura/layout, la paleta HEX sigue siendo exclusivamente
la de la tabla de Paleta.

### Tarjeta de perfil en el sidebar

`front/src/app/core/shell/shell.component.ts` agrega, ARRIBA de los grupos
de navegación (antes de "GESTIÓN DE LLAVES") y separada por un divisor de
1px (`.shell__perfil-divisor`): un bloque `.shell__perfil` con, de arriba a
abajo:

- Avatar cuadrado-redondeado (`--radius-md`) con las iniciales del usuario
  (hasta 2, derivadas de `AuthService.currentUser().nombre`), fondo verde
  institucional tenue (`rgba(255,255,255,0.18)` sobre el verde de fondo del
  sidebar).
- Nombre del usuario, bold, blanco (`AuthService.currentUser().nombre`).
- Subtítulo pequeño y tenue: el correo institucional
  (`emailInstitucional`) — el schema de `UsuarioAutenticado` no trae un
  nombre de organización/unidad propio, así que se usa el dato real
  disponible más parecido en vez de inventar un texto fijo.
- Píldora de rol (`.shell__perfil-rol`, fondo `#024426`, texto claro): el
  NOMBRE legible del rol, resuelto vía `resolverNombreRol()`
  (`core/auth/rol-resolver.ts`, ya existente y reusado tal cual — el mismo
  resolutor que usa `rol.guard.ts`/`historial.service.ts` contra
  `GET /api/catalogos/roles`), no un enum fijo en el cliente.

Colapso del sidebar (68px): igual criterio que los labels de ítem de
navegación — `.shell__perfil-datos` se desvanece con
`opacity`/`max-width` (`var(--transition-layout)`), nunca `display:none`;
el avatar se mantiene visible solo-ícono.

### Reserva individual — layout de dos columnas + agenda de disponibilidad

`front/src/app/features/reservas/reserva-form-dialog.component.ts`: el
panel del diálogo pasa de una columna a un grid de dos
(`.reserva-form-dialog__layout`, `minmax(0,1fr) minmax(260px,320px)`,
colapsa a una columna bajo 720px). Columna izquierda: los mismos campos de
siempre (solicitante, salón, fecha, horas, motivo) más un
`mat-checkbox` "Entrega de llave al momento" — **NO existe
`entrega_llave_momento` en `ReservaIndividualIn`** (ver
`back/reservas/controller.py`), así que este toggle es SOLO de UI por
ahora (no viaja en el payload), documentado con un TODO en el propio
template.

Columna derecha: `<app-reserva-agenda-disponibilidad>`
(`reserva-agenda-disponibilidad.component.ts`, nuevo), un panel "Agenda de
disponibilidad" — grilla de slots de 1h (ventana 06:00–22:00, sin contrato
de horario de operación en el backend) coloreada contra las ocupaciones
reales del salón+fecha elegidos, con leyenda de estados al pie:

| Estado | Color | Paleta |
|---|---|---|
| Disponible | Verde | éxito (`#008b50`) |
| Seleccionado | Turquesa | info (`#04b5ac`) |
| Clase (programación académica) | Amarillo | atención (`#ffca00`) |
| Semestral | Naranja | peligro (`#e28210`) |
| Reserva (individual) | Azul | neutro (`#1d3475`) |

Clic en un slot "Disponible" prellena `hora_inicio`/`hora_fin` del
formulario (`onSlotElegido()`). Los datos de ocupación NO reusan
`DisponibilidadService` de `features/disponibilidad` — ninguna feature
importa el TypeScript de otra (ver `front/README.md`) — sino una copia
local mínima (`reserva-disponibilidad.service.ts`/`.models.ts`) que golpea
el mismo endpoint público `GET /api/disponibilidad/salon/{salon_id}`,
mismo criterio de duplicación deliberada que ya usa `disponibilidad`
contra `reservas`.

### Programación académica (feature nueva)

`front/src/app/features/programacion/` — el backend
(`GET /semestres`, `POST /importar`, ver
`back/programacion/controller.py`) ya existía sin frontend propio. Página
nueva en `/programacion` (nav "Programación" en el grupo Catálogos):

- Encabezado `.uco-page-header__title` (ícono `calendar_month` + título) +
  `__desc` con conteo real ("N semestres cargados").
- Botón "Importar Excel" arriba a la derecha: abre un `<input type="file">`
  oculto, sube el `.xlsx` vía `POST /api/programacion/importar`
  (multipart) y muestra el resultado (creadas, creadas sin docente, filas
  omitidas con motivo) en un `Swal.fire()` propio — incluye una lista
  desplazable de omitidas, mismos colores institucionales que
  `NotificationService`/`ConfirmService` (no se introdujo un componente de
  diálogo de resultado genérico nuevo para un caso de uso único).
- Semestres como tarjetas border-first (`--radius-lg`, `--border-surface`):
  código en verde bold, píldora "`N` registros" (conteo REAL, calculado en
  el cliente agrupando `GET /api/programacion/` por `semestre_id` — el
  backend no expone ese agregado), fecha inicio/fin.
- Botones de editar/eliminar en la esquina superior derecha de cada
  tarjeta: se muestran **deshabilitados con tooltip** ("no disponible: el
  backend no expone..."), porque `Semestre` no tiene PATCH ni DELETE en el
  backend — no se llama a ningún endpoint inexistente.
- La línea "cargado el ... por ..." del mockup de referencia de AulaSync
  **no se implementó**: el backend no guarda metadata de auditoría de la
  carga (ni fecha de importación ni usuario), y esta feature no inventa
  esos datos.

## Inventario de archivos de este directorio

| Archivo | Contenido | Responsable |
|---|---|---|
| `01-fundacion.drawio` | Login + Shell/Dashboard (define el patrón) | base |
| `02-llaves-prestamos-disponibilidad.drawio` | Llaves, Préstamos, Disponibilidad | grupo A |
| `03-reservas.drawio` | Reservas, Reservas Semestrales | grupo B |
| `04-catalogos.drawio` | Salones, Ubicaciones, Bloques, Tipos de Silletería (Roles/Tipos de Persona no existen como componentes propios en `front/src/app/features/catalogos/` — confirmado en el código, no se maquetaron) | grupo C |
| `05-personas.drawio` | Usuarios, Comunidad, Monitores | grupo D |
| `06-seguimiento-y-sistema.drawio` | Novedades, Notificaciones, Historial, Configuración | grupo E |

Cada archivo de feature incluye, por cada vista real del frontend
(`front/src/app/features/<feature>/`): 1 página de **lista** (tabla +
filtros + botón de acción principal) y 1 página de **formulario/diálogo**
representativo (el más importante de esa feature, no todos los diálogos
posibles). Todas las páginas reusan el sidebar/header de
`01-fundacion.drawio` tal cual (mismo layout, solo cambia el ítem activo y
el contenido).
