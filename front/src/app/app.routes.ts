import { Routes } from '@angular/router';

import { AuthCallbackComponent } from './core/auth/auth-callback.component';
import { authGuard } from './core/auth/auth.guard';
import { crearGuardaDeRol } from './core/auth/rol.guard';
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
      // Séptima feature real (`monitores`, ver `src/app/features/monitores/`):
      // una sola vista. Estructuralmente es más parecida a `usuarios` que a
      // `reservas`/`prestamos`: no hay ciclo de vida de estado, solo el flag
      // `activo` con soft-delete vía `desactivar` — y a diferencia de `usuarios`,
      // tampoco hay `reactivar` (ver back/monitores/controller.py: solo
      // `GET /`, `GET /{id}`, `POST /` y `POST /{id}/desactivar`).
      {
        path: 'monitores',
        loadComponent: () =>
          import('./features/monitores/monitores-list.component').then(
            (m) => m.MonitoresListComponent,
          ),
      },
      // Octava feature real (`novedades`, ver `src/app/features/novedades/`):
      // una sola vista. Estructuralmente es la MÁS parecida a `monitores`:
      // crear y una ÚNICA transición de estado (acá `cerrar` en vez de
      // `desactivar`), sin PATCH ni DELETE y sin endpoint de vuelta (ver
      // back/novedades/controller.py: solo `GET /`, `GET /{id}`, `POST /`,
      // `GET /estado/{estado}`, `GET /categoria/{categoria}` y
      // `POST /{id}/cerrar` — no existe `POST /{id}/reabrir`). Es además la
      // segunda feature que depende de `core/auth` (después de `usuarios`):
      // `POST /` exige `registrado_por_id`, que sale de
      // `AuthService.currentUser().id` en vez de un selector.
      {
        path: 'novedades',
        loadComponent: () =>
          import('./features/novedades/novedades-list.component').then(
            (m) => m.NovedadesListComponent,
          ),
      },
      // Novena feature real (`notificaciones`, ver
      // `src/app/features/notificaciones/`): una sola vista. Tampoco es un
      // CRUD ni un ciclo de vida de estado propio (no hay "cerrar"/
      // "cancelar"/"desactivar" sobre una fila existente): `estado_envio` lo
      // decide el backend según si el envío SMTP tuvo éxito, nunca el
      // cliente (ver back/notificaciones/service.py). Es crear (enviar) y
      // listar/filtrar — la acción "Reenviar" (RF24) reutiliza el mismo
      // diálogo de envío para crear una fila nueva, no muta la fallida (ver
      // notificaciones.service.ts).
      {
        path: 'notificaciones',
        loadComponent: () =>
          import('./features/notificaciones/notificaciones-list.component').then(
            (m) => m.NotificacionesListComponent,
          ),
      },
      // Décima feature real (`disponibilidad`, ver
      // `src/app/features/disponibilidad/`): RF14, una sola vista de SOLO
      // LECTURA (a diferencia de todas las anteriores, no hay ningún botón de
      // escritura). Consulta `GET /api/disponibilidad/salon/{salon_id}`
      // (único endpoint del módulo) superponiendo las tres fuentes
      // (programación académica, reservas semestrales, reservas
      // individuales) y resaltando los conflictos que el backend ya calculó.
      {
        path: 'disponibilidad',
        loadComponent: () =>
          import('./features/disponibilidad/disponibilidad-vista.component').then(
            (m) => m.DisponibilidadVistaComponent,
          ),
      },
      // Undecima feature real (`comunidad`, ver
      // `src/app/features/comunidad/`): RF26, una sola vista de SOLO
      // LECTURA (mismo criterio que `disponibilidad`: no hay ningun boton
      // de escritura, ver la nota de alcance en comunidad.service.ts para
      // RF25/RF26). Es la PRIMERA ruta protegida por rol ademas de sesion:
      // RF26 exige que Portero NO tenga acceso al directorio de comunidad,
      // asi que ademas de `authGuard` (arriba, ruta padre) esta ruta agrega
      // `crearGuardaDeRol(...)`, el primer guard por rol del proyecto (ver
      // core/auth/rol.guard.ts para la nota de diseño completa: por que
      // resuelve el rol contra GET /api/catalogos/roles en vez de comparar
      // un id fijo).
      {
        path: 'comunidad',
        canActivate: [crearGuardaDeRol(['Administrador', 'Auxiliar'])],
        loadComponent: () =>
          import('./features/comunidad/comunidad-list.component').then(
            (m) => m.ComunidadListComponent,
          ),
      },
      // Duodécima feature real (`configuracion`, ver
      // `src/app/features/configuracion/`): una sola vista, y la primera que
      // es un SINGLETON en vez de una lista o un ciclo de vida — el backend
      // solo expone `GET /api/configuracion/` (get-or-create, nunca 404) y
      // `PUT /api/configuracion/` (reemplazo completo) sobre una única fila
      // que siempre existe (ver back/configuracion/controller.py). Por eso
      // la ruta apunta directo a un formulario de edición
      // (`ConfiguracionFormComponent`), sin una vista de lista intermedia.
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/configuracion/configuracion-form.component').then(
            (m) => m.ConfiguracionFormComponent,
          ),
      },
      // Décimotercera feature real (`historial`, ver
      // `src/app/features/historial/`): RF27, una sola vista de SOLO
      // LECTURA (mismo criterio que `disponibilidad`/`comunidad`, ver la
      // nota de alcance en historial.service.ts). A diferencia de
      // `comunidad`, esta ruta NO agrega `crearGuardaDeRol(...)`: RF28 no
      // bloquea a ningún rol fuera de la ruta, solo acota lo que CADA rol ve
      // dentro de ella (Portero ve solo lo que él procesó, Administrador/
      // Auxiliar ven todo) -- esa decisión vive dentro de
      // `HistorialService`, no en el guard de la ruta.
      {
        path: 'historial',
        loadComponent: () =>
          import('./features/historial/historial-list.component').then(
            (m) => m.HistorialListComponent,
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
