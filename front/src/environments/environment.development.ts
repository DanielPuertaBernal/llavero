// Entorno de desarrollo (`ng serve`, fileReplacement en angular.json).
// El backend Django se levanta en localhost:8080 en este proyecto
// (`manage.py runserver 8080`, en vez del puerto 8000 por defecto).
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080/api',
};
