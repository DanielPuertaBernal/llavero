import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Medidor circular 0-100% del tiempo transcurrido hacia la mora de un
 * préstamo/llave (verde→amarillo→rojo), documentado como pendiente en
 * `AulaSync/analisis/estrategia-migracion/frontend.md` ("Indicador de
 * tiempo restante antes de mora") y en `core/shared/README.md`. Ahí se
 * planeaba resolver con `p-knob` de PrimeNG; al quitar PrimeNG (licencia),
 * se resuelve con un `<svg>` propio en vez de sumar otra librería — mismo
 * criterio original de "sin librería adicional".
 */
@Component({
  selector: 'app-mora-gauge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="tamano()" [attr.height]="tamano()" viewBox="0 0 100 100" role="img" [attr.aria-label]="etiqueta()">
      <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e5e4" stroke-width="10" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        [attr.stroke]="color()"
        stroke-width="10"
        stroke-linecap="round"
        [attr.stroke-dasharray]="circunferencia"
        [attr.stroke-dashoffset]="offset()"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="55" text-anchor="middle" font-family="Poppins" font-size="20" font-weight="600" [attr.fill]="color()">
        {{ porcentajeClamp() }}%
      </text>
    </svg>
  `,
})
export class MoraGaugeComponent {
  /** 0-100. Valores fuera de rango se recortan (clamp). */
  readonly porcentaje = input.required<number>();
  readonly tamano = input(64);

  private readonly circunferenciaValor = 2 * Math.PI * 42;
  protected readonly circunferencia = this.circunferenciaValor;

  protected readonly porcentajeClamp = computed(() =>
    Math.round(Math.min(100, Math.max(0, this.porcentaje()))),
  );

  protected readonly offset = computed(
    () => this.circunferenciaValor * (1 - this.porcentajeClamp() / 100),
  );

  /** Verde por debajo del 60%, amarillo 60-85%, naranja (peligro/mora) desde 85% — mismos colores semánticos de la spec visual. */
  protected readonly color = computed(() => {
    const p = this.porcentajeClamp();
    if (p >= 85) return '#e28210';
    if (p >= 60) return '#ffca00';
    return '#008b50';
  });

  protected readonly etiqueta = computed(
    () => `${this.porcentajeClamp()}% transcurrido hacia mora`,
  );
}
