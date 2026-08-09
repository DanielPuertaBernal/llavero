// Entorno de desarrollo (`ng serve`, fileReplacement en angular.json).
// El backend Django corre por defecto en localhost:8000 (convención de
// `manage.py runserver`); no se lee `back/.env` para confirmarlo.
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000/api',
};
