import { Routes } from '@angular/router';

import { AuthCallbackComponent } from './core/auth/auth-callback.component';
import { authGuard } from './core/auth/auth.guard';
import { DashboardPlaceholderComponent } from './dashboard-placeholder/dashboard-placeholder.component';

// Scaffold mínimo: solo la ruta de aterrizaje del login federado y una
// ruta protegida vacía para probar el flujo de auth de punta a punta. Sin
// rutas de feature todavía (ver `src/app/features/`, vacío a propósito) —
// esas se agregan una por una en sesiones futuras.
export const routes: Routes = [
  { path: 'auth/callback', component: AuthCallbackComponent },
  { path: 'dashboard', component: DashboardPlaceholderComponent, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
];
