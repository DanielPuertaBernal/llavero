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
