import { Routes } from '@angular/router';

import { AuthCallbackComponent } from './core/auth/auth-callback.component';
import { authGuard } from './core/auth/auth.guard';
import { DashboardPlaceholderComponent } from './dashboard-placeholder/dashboard-placeholder.component';

// Todas las features protegidas viven como hijas de `ShellComponent` (ver
// `core/shell/shell.component.ts`): un solo `authGuard` acá arriba en vez
// de uno repetido por ruta. `auth/callback` queda fuera del shell a
// propósito — es la pantalla de callback OAuth, sin navegación, no debe
// mostrar la barra de navegación ni requerir sesión ya establecida.
export const routes: Routes = [
  { path: 'auth/callback', component: AuthCallbackComponent },
  {
    path: '',
    // `loadComponent`, no `component`, por la misma razón que el resto de
    // rutas en este archivo: `ShellComponent` importa `p-menubar` de
    // PrimeNG, y si se carga de forma eager el módulo termina en el bundle
    // inicial (`main.js`), infla su peso y dispara el warning de budget de
    // `angular.json` (500 kB) — cargarlo perezoso lo aísla en su propio
    // chunk, igual que cada feature.
    loadComponent: () => import('./core/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardPlaceholderComponent },
      // Primera feature real (`catalogos`, ver `src/app/features/catalogos/`):
      // dos rutas hermanas (Salones/Ubicaciones son vistas independientes, no
      // una jerarquía padre-hijo) cargadas de forma perezosa con
      // `loadComponent` (estilo actual de Angular para standalone
      // components).
      {
        path: 'catalogos/salones',
        loadComponent: () =>
          import('./features/catalogos/salones/salones-list.component').then(
            (m) => m.SalonesListComponent,
          ),
      },
      {
        path: 'catalogos/ubicaciones',
        loadComponent: () =>
          import('./features/catalogos/ubicaciones/ubicaciones-list.component').then(
            (m) => m.UbicacionesListComponent,
          ),
      },
      // Segunda feature real (`llaves`, ver `src/app/features/llaves/`): una
      // sola vista (el tablero de préstamos), porque el módulo no es un CRUD
      // sino un ciclo de vida entrega -> devolución (el backend no expone
      // PATCH ni DELETE sobre llaves, ver back/llaves/controller.py).
      {
        path: 'llaves',
        loadComponent: () =>
          import('./features/llaves/llaves-list.component').then((m) => m.LlavesListComponent),
      },
      // Tercera feature real (`prestamos`, ver `src/app/features/prestamos/`):
      // también una sola vista, por la misma razón que llaves — el módulo es
      // un ciclo de vida (entrega de N equipos -> devoluciones parciales ->
      // devolución completa), no un CRUD (ver back/prestamos/controller.py).
      // El detalle de cada préstamo se abre expandiendo su fila, sin ruta
      // propia.
      {
        path: 'prestamos',
        loadComponent: () =>
          import('./features/prestamos/prestamos-list.component').then(
            (m) => m.PrestamosListComponent,
          ),
      },
      // Cuarta feature real (`usuarios`, ver `src/app/features/usuarios/`):
      // una sola vista, el padrón de operadores. Tampoco es un CRUD — el
      // backend solo expone crear y desactivar, sin PATCH, sin DELETE y sin
      // endpoint para reactivar (ver back/usuarios/controller.py). Es además
      // la primera feature que depende de `core/auth`: `POST
      // /{id}/desactivar` exige el id del usuario que ejecuta la acción.
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./features/usuarios/usuarios-list.component').then(
            (m) => m.UsuariosListComponent,
          ),
      },
      // Quinta feature real (`reservas`, ver `src/app/features/reservas/`):
      // una sola vista, por la misma razón que llaves y prestamos — el
      // módulo es un ciclo de vida (`aprobada` ->
      // `cancelada`/`completada`/`no_reclamada`), no un CRUD (ver
      // back/reservas/controller.py). La ruta es `reservas` a secas porque
      // cubre solo la reserva INDIVIDUAL; la reserva semestral es otro
      // módulo del backend (`/api/reservas-semestrales`) y tendrá su propia
      // ruta hermana cuando exista su feature.
      {
        path: 'reservas',
        loadComponent: () =>
          import('./features/reservas/reservas-list.component').then(
            (m) => m.ReservasListComponent,
          ),
      },
      // Sexta feature real (`reservas-semestrales`, ver
      // `src/app/features/reservas-semestrales/`): la ruta hermana prometida en
      // la nota de arriba. Cubre la franja RECURRENTE semanal vigente durante un
      // semestre (`back/reservas_semestrales/controller.py`) — otra tabla, otro
      // módulo del backend, sin columna `estado` (cancelar es un DELETE real del
      // grupo completo, no una transición). Una sola vista, mismo criterio que
      // sus hermanas: el backend solo permite crear el grupo y cancelarlo, no hay
      // PATCH ni DELETE por franja suelta.
      {
        path: 'reservas-semestrales',
        loadComponent: () =>
          import('./features/reservas-semestrales/reservas-semestrales-list.component').then(
            (m) => m.ReservasSemestralesListComponent,
          ),
      },
      // El redirect raíz vive DENTRO del árbol de hijas del shell (no como
      // hermano de nivel superior): así entra en la misma rama protegida
      // por el único `authGuard` de arriba y termina resolviendo dentro del
      // `<router-outlet>` propio de `ShellComponent` — navegar a `/`
      // renderiza la barra de navegación con `/dashboard` activo, en vez de
      // redirigir a un `/dashboard` que quedara fuera del shell.
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];
