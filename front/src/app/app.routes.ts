import { Routes } from '@angular/router';

import { AuthCallbackComponent } from './core/auth/auth-callback.component';
import { authGuard } from './core/auth/auth.guard';
import { DashboardPlaceholderComponent } from './dashboard-placeholder/dashboard-placeholder.component';

// Primera feature real (`catalogos`, ver `src/app/features/catalogos/`):
// dos rutas hermanas (Salones/Ubicaciones son vistas independientes, no
// una jerarquía padre-hijo) cargadas de forma perezosa con `loadComponent`
// (estilo actual de Angular para standalone components), protegidas por el
// mismo `authGuard` que la ruta placeholder.
export const routes: Routes = [
  { path: 'auth/callback', component: AuthCallbackComponent },
  { path: 'dashboard', component: DashboardPlaceholderComponent, canActivate: [authGuard] },
  {
    path: 'catalogos/salones',
    loadComponent: () =>
      import('./features/catalogos/salones/salones-list.component').then(
        (m) => m.SalonesListComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'catalogos/ubicaciones',
    loadComponent: () =>
      import('./features/catalogos/ubicaciones/ubicaciones-list.component').then(
        (m) => m.UbicacionesListComponent,
      ),
    canActivate: [authGuard],
  },
  // Segunda feature real (`llaves`, ver `src/app/features/llaves/`): una
  // sola vista (el tablero de préstamos), porque el módulo no es un CRUD
  // sino un ciclo de vida entrega -> devolución (el backend no expone PATCH
  // ni DELETE sobre llaves, ver back/llaves/controller.py).
  {
    path: 'llaves',
    loadComponent: () =>
      import('./features/llaves/llaves-list.component').then((m) => m.LlavesListComponent),
    canActivate: [authGuard],
  },
  // Tercera feature real (`prestamos`, ver `src/app/features/prestamos/`):
  // también una sola vista, por la misma razón que llaves — el módulo es un
  // ciclo de vida (entrega de N equipos -> devoluciones parciales ->
  // devolución completa), no un CRUD (ver back/prestamos/controller.py). El
  // detalle de cada préstamo se abre expandiendo su fila, sin ruta propia.
  {
    path: 'prestamos',
    loadComponent: () =>
      import('./features/prestamos/prestamos-list.component').then((m) => m.PrestamosListComponent),
    canActivate: [authGuard],
  },
  // Cuarta feature real (`usuarios`, ver `src/app/features/usuarios/`): una
  // sola vista, el padrón de operadores. Tampoco es un CRUD — el backend
  // solo expone crear y desactivar, sin PATCH, sin DELETE y sin endpoint
  // para reactivar (ver back/usuarios/controller.py). Es además la primera
  // feature que depende de `core/auth`: `POST /{id}/desactivar` exige el id
  // del usuario que ejecuta la acción.
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./features/usuarios/usuarios-list.component').then((m) => m.UsuariosListComponent),
    canActivate: [authGuard],
  },
  // Quinta feature real (`reservas`, ver `src/app/features/reservas/`): una
  // sola vista, por la misma razón que llaves y prestamos — el módulo es un
  // ciclo de vida (`aprobada` -> `cancelada`/`completada`/`no_reclamada`), no
  // un CRUD (ver back/reservas/controller.py). La ruta es `reservas` a secas
  // porque cubre solo la reserva INDIVIDUAL; la reserva semestral es otro
  // módulo del backend (`/api/reservas-semestrales`) y tendrá su propia ruta
  // hermana cuando exista su feature.
  {
    path: 'reservas',
    loadComponent: () =>
      import('./features/reservas/reservas-list.component').then((m) => m.ReservasListComponent),
    canActivate: [authGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
];
