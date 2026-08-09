// Entorno de producción. El build de producción usa este archivo tal cual
// (no hay fileReplacement para "production" en angular.json); ajustar
// `apiBaseUrl` al desplegar, o introducir un fileReplacement dedicado si el
// valor de producción difiere por ambiente.
export const environment = {
  production: true,
  // Base de la API del backend (Django Ninja monta todo bajo /api/, ver
  // back/config/urls.py). Sin variable de entorno de build en este scaffold:
  // placeholder explícito a reemplazar cuando exista un dominio real.
  apiBaseUrl: 'http://localhost:8000/api',
};
