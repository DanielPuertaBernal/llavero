# Llavero — Frontend

Stack: **Angular 22 + TypeScript (strict) + PrimeNG**, TanStack Query para server-state.

Autenticación federada con Office 365: **sin librería MSAL** en el frontend — el backend ya resuelve el flujo completo (Authorization Code con callback en `GET /api/auth/callback`, ver `back/auth/service.py`). El frontend solo redirige a `GET /api/auth/login`, recibe un código opaco de un solo uso en `FRONTEND_POST_LOGIN_REDIRECT_URL`, y lo canjea vía `POST /api/auth/exchange` para obtener el par de JWT propios.

Ver el diseño completo en [`../DOC/`](../DOC/README.md):
- Requerimientos: `DOC/2. Diseño estratégico/2.2 Requerimientos.md`
- Diagrama de paquetes (features): `DOC/4. DiseñoTacticoDetallado/4.3 Diagrama de Paquetes.md`
- Diagrama de componentes: `DOC/4. DiseñoTacticoDetallado/4.4 Diagrama de Componentes.md`

## Estado

Core/Auth de punta a punta, más la primera feature real: `Catalogos`
(Salones + Bloques + TiposSilleteria, Ubicaciones — ver
`src/app/features/catalogos/`). Roles y TipoPersona quedan fuera de
alcance a propósito (sin página de administración, ver docstrings del
módulo). El resto de las 14 features (Llaves, Prestamos, etc.) se
construyen una por una en sesiones futuras.

## Estructura

```
src/app/
  core/
    auth/        AuthService (signals), interceptor HTTP, guard, componente
                 de aterrizaje post-login (auth-callback)
    http/        provideCoreHttp() — HttpClient + interceptor + TanStack Query
    theme/       preset PrimeNG con los colores institucionales UCO
    shared/      vacío a propósito — componentes PrimeNG reutilizables
                 (lector de credencial, indicador de mora) cuando la
                 primera feature los necesite, ver core/shared/README.md
  features/
    catalogos/   Salones (+ Bloques/TiposSilleteria co-gestionados desde su
                 vista) y Ubicaciones — cada entidad con su servicio de
                 datos co-localizado (injectQuery/injectMutation)
                 [las 14 features restantes del dominio se agregan una por
                 una en sesiones futuras, mismo patrón]
  dashboard-placeholder/
                 placeholder de solo prueba del flujo de auth end-to-end,
                 se reemplaza por la feature Dashboard real
```

Regla dura (igual que en el backend, `service.py` como única API pública de
un módulo): ninguna feature importa código de otra feature directamente,
solo de `core/`. Ver `DOC/4. DiseñoTacticoDetallado/4.3 Diagrama de
Paquetes.md`.

## Flujo de auth

1. `AuthService.login()` redirige el navegador a `GET /api/auth/login`.
2. Microsoft redirige al backend (`GET /api/auth/callback`) — el frontend
   nunca toca esa URL.
3. El backend redirige al frontend con `?code=<opaco>` en
   `FRONTEND_POST_LOGIN_REDIRECT_URL` (debe apuntar a la ruta
   `/auth/callback` de esta app).
4. `AuthCallbackComponent` lee `code`, llama `AuthService.exchange(codigo)`
   (`POST /api/auth/exchange`) y recibe `{access_token, refresh_token}`.
5. Solo el `refresh_token` se persiste (`localStorage`); el `access_token`
   vive en memoria (signal), nunca en storage — mismo patrón que el
   `authStore` Zustand del legacy.
6. Al arrancar la app, `provideAppInitializer` llama a
   `AuthService.restoreSession()`: si hay un refresh token persistido,
   intenta un refresh silencioso antes de renderizar.
7. El interceptor HTTP (`core/auth/auth.interceptor.ts`) adjunta el bearer
   token a cada request y, ante un 401, dispara `AuthService.refresh()` y
   reintenta una vez — refresh concurrente deduplicado: si varias requests
   caen en 401 al mismo tiempo, solo se dispara una llamada real a
   `POST /api/auth/refresh`, el resto espera esa misma promesa.

## Desarrollo

```bash
npm install
npm start        # ng serve — http://localhost:4200
npm test         # ng test — Vitest (default del Angular CLI actual)
npm run build    # ng build — build de producción
```

Requiere el backend corriendo en `http://localhost:8000` (configurable en
`src/environments/environment*.ts`) — no se necesita levantarlo para que
el frontend compile o para correr los tests (mockeados con
`HttpClientTestingModule`).

## Notas técnicas del scaffold

- **Test runner**: Vitest (`@angular/build:unit-test`), el default actual
  del Angular CLI para proyectos nuevos — no se forzó Karma/Jasmine.
- **PrimeNG**: `providePrimeNG` + `@primeuix/themes` (el paquete
  `@primeng/themes` quedó deprecado a favor de este). Preset propio
  (`core/theme/llavero-preset.ts`) con el verde institucional UCO
  (`#008b50`) como color primario — theming completo (superficie,
  tipografía Montserrat/Poppins) queda deferido a cuando exista UI real.
- **TanStack Query**: `@tanstack/angular-query-experimental` (nombre de
  paquete correcto verificado en npm — sigue siendo "experimental" en su
  nomenclatura pese a ser la integración oficial recomendada).
- **`front/README.md` vs. `DOC/4.4 Diagrama de Componentes.md`**: ese
  diagrama todavía menciona "MSAL Angular" como librería del frontend —
  quedó desactualizado tras la decisión posterior de eliminar MSAL (ver
  arriba); este scaffold sigue la decisión vigente (sin MSAL), no el
  diagrama.
