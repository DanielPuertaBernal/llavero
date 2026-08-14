import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

interface RolLookupDto {
  id: string;
  nombre: string;
}

/**
 * Fábrica de guards por rol (RF26: el directorio de comunidad solo lo
 * pueden consultar Administrador y Auxiliar -- Portero NO tiene acceso).
 *
 * Nota -- este es el PRIMER guard por rol del proyecto: hasta ahora
 * (ver app.routes.ts) ninguna ruta protegida distingue por rol, solo por
 * sesion iniciada (authGuard). No existia ningun precedente que copiar.
 *
 * Nota de diseño -- por qué se resuelve el rol contra un HTTP GET y no
 * contra AuthService.currentUser() directamente: UsuarioAutenticado
 * (ver auth.models.ts, tal como lo devuelve GET /api/auth/me) solo trae
 * rolId (un UUID), nunca el nombre del rol. Rol es un catalogo editable
 * por el operador (ver back/catalogos/controller.py: CRUD completo sobre
 * /catalogos/roles), asi que el UUID no es un enum fijo que se pueda
 * comparar en el cliente sin resolverlo primero -- de ahi la consulta a
 * GET /api/catalogos/roles en cada activacion de la ruta.
 *
 * Nota de diseño -- falla CERRADO en los tres casos donde no se puede
 * confirmar el rol (sin sesion, rol no encontrado en el catalogo, o el
 * GET de roles falla): en los tres se redirige a /dashboard en vez de
 * dejar pasar. El docblock de authGuard ya advierte no repetir el
 * hallazgo de auditoria del legacy ("autorizacion de rol validada solo en
 * cliente"): este guard es UX (evita mostrar una ruta a quien no deberia
 * verla), nunca la autoridad real -- esa sigue sin existir en el backend
 * para estos endpoints (back/comunidad/controller.py no tiene ningun
 * chequeo de rol todavia), y esa brecha queda fuera del alcance de esta
 * feature de frontend.
 */
export function crearGuardaDeRol(rolesPermitidos: string[]): CanActivateFn {
  return async () => {
    const authService = inject(AuthService);
    const http = inject(HttpClient);
    const router = inject(Router);

    const usuario = authService.currentUser();
    if (!usuario) {
      return router.createUrlTree(['/dashboard']);
    }

    try {
      const roles = await firstValueFrom(
        http.get<RolLookupDto[]>(`${environment.apiBaseUrl}/catalogos/roles`),
      );
      const nombreRol = roles.find((rol) => rol.id === usuario.rolId)?.nombre;
      if (nombreRol && rolesPermitidos.includes(nombreRol)) {
        return true;
      }
    } catch {
      // Ver la nota de diseño del docblock: falla cerrado, redirige abajo.
    }

    return router.createUrlTree(['/dashboard']);
  };
}
