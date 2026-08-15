import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';

import { AuthService } from '../auth/auth.service';
import { ShellComponent } from './shell.component';

// Ruta hija mínima solo para que `provideRouter` tenga algo que montar en
// el `<router-outlet>` propio del shell — no es una feature real.
@Component({ template: '' })
class RutaHijaDePruebaComponent {}

describe('ShellComponent', () => {
  const logout = vi.fn().mockResolvedValue(undefined);

  const authServiceStub = {
    currentUser: () => ({ nombre: 'Ana Docente' }),
    logout,
  };

  beforeEach(async () => {
    logout.mockClear();

    // Angular CDK (`mat-sidenav`/overlay) usa `window.matchMedia` para su
    // comportamiento responsive — jsdom no lo implementa. Stub scoped a
    // este spec.
    if (!window.matchMedia) {
      window.matchMedia = () =>
        ({
          matches: false,
          media: '',
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList;
    }

    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([{ path: 'dashboard', component: RutaHijaDePruebaComponent }]),
        { provide: AuthService, useValue: authServiceStub },
      ],
    }).compileComponents();
  });

  function crearComponente() {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('se crea', () => {
    const fixture = crearComponente();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renderiza los links de navegación a todas las features protegidas', () => {
    const fixture = crearComponente();
    const hrefs = fixture.debugElement
      .queryAll(By.css('a[href]'))
      .map((debugEl) => (debugEl.nativeElement as HTMLAnchorElement).getAttribute('href'));

    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/dashboard',
        '/catalogos/salones',
        '/catalogos/ubicaciones',
        '/llaves',
        '/prestamos',
        '/usuarios',
        '/reservas',
        '/notificaciones',
      ]),
    );
  });

  it('muestra el nombre del usuario autenticado', () => {
    const fixture = crearComponente();
    expect(fixture.nativeElement.textContent).toContain('Ana Docente');
  });

  it('el botón de cerrar sesión invoca authService.logout()', () => {
    const fixture = crearComponente();
    const boton = fixture.debugElement.query(By.css('button[aria-label="Cerrar sesión"]'));

    expect(boton).toBeTruthy();
    boton.nativeElement.click();

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
