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
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
];
