import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Placeholder de carga reutilizable (equivalente a `animate-pulse` de
 * Tailwind en AulaSync, resuelto acá con un `@keyframes` propio — sin sumar
 * ninguna librería nueva, mismo criterio que `MoraGaugeComponent`). Usa el
 * gris de superficie institucional (`#f5f7f6` base / `#e2e5e4` brillo del
 * shimmer, ver `00-especificacion-visual.md`) y los radios de
 * `core/theme/_elevation.scss`.
 *
 * Variantes:
 * - `row`: placeholder de una fila de tabla (ancho completo, bajo).
 * - `card`: placeholder de tarjeta KPI/dashboard (radio lg, más alto).
 * - `text`: línea de texto suelta (radio sm, para meta-texto/labels).
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="skeleton" [class]="'skeleton--' + variant()" [attr.aria-hidden]="true"></div>`,
  styles: `
    .skeleton {
      background: #f5f7f6;
      background-image: linear-gradient(90deg, #f5f7f6 0%, #e2e5e4 50%, #f5f7f6 100%);
      background-size: 200% 100%;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    .skeleton--row {
      width: 100%;
      height: 20px;
      border-radius: var(--radius-sm);
      margin: 8px 0;
    }

    .skeleton--card {
      width: 100%;
      height: 96px;
      border-radius: var(--radius-lg);
    }

    .skeleton--text {
      width: 60%;
      height: 12px;
      border-radius: var(--radius-sm);
    }

    @keyframes skeleton-pulse {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }
  `,
})
export class SkeletonComponent {
  readonly variant = input<'row' | 'card' | 'text'>('row');
}
