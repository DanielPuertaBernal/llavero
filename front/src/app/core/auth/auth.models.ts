// Formas de request/response del módulo `auth` del backend (Django Ninja,
// ver back/auth/controller.py) — snake_case porque así viaja por HTTP
// (Pydantic/Ninja Schema). No convertir a camelCase acá: son DTOs de red.

export interface TokenPairDto {
  access_token: string;
  refresh_token: string;
}

export interface UsuarioAutenticadoDto {
  id: string;
  nombre: string;
  email_institucional: string;
  rol_id: string;
  ubicacion_id: string;
}

export interface ErrorDetalleDto {
  detail: string;
}

// Modelo de dominio expuesto por `AuthService` al resto del frontend
// (camelCase, convención TypeScript) — todo el mapeo snake_case -> camelCase
// vive dentro de `AuthService`, ningún otro consumidor debe ver los DTOs.
export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  emailInstitucional: string;
  rolId: string;
  ubicacionId: string;
}
