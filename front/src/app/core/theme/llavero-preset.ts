import Aura from '@primeuix/themes/aura';
import { definePreset, palette } from '@primeuix/themes';

/**
 * Preset PrimeNG mínimo con los colores institucionales UCO (ver
 * `DOC/5. Identidad Visual/5.1 Manual de Marca UCO.md`, "Guía de color"):
 * verde institucional `#008b50` como color primario. `palette()` genera
 * automáticamente la escala 50-950 que PrimeNG espera a partir de ese hex
 * exacto — no hay que inventar los tonos intermedios a mano.
 *
 * El amarillo institucional (`#ffca00`) y los complementarios (azul
 * `#1d3475`, verde oscuro `#024426`, turquesa `#04b5ac`, naranja `#e28210`)
 * no se mapean acá todavía: un theming completo (superficie, estados de
 * feedback, tipografía Montserrat/Poppins) queda deliberadamente fuera de
 * este scaffold — se define feature por feature, cuando haya UI real que
 * lo necesite, no antes.
 */
export const LlaveroPreset = definePreset(Aura, {
  semantic: {
    primary: palette('#008b50'),
  },
});
