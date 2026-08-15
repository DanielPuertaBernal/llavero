import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { provideCoreHttp } from './core/http/core-http.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideCoreHttp(),
    provideAnimationsAsync(),
    // `restoreSession()` corre antes de que la app renderice — si hay un
    // refresh token persistido de una sesión anterior, intenta restaurarla
    // en silencio (ver AuthService.restoreSession y frontend.md, "Auth").
    // `provideAppInitializer` es la API funcional actual de Angular
    // (reemplaza el patrón `APP_INITIALIZER` + factory de versiones previas).
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};
