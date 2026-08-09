# core/shared

Vacío a propósito en este scaffold. Acá van los componentes PrimeNG
reutilizables mencionados en `DOC/4. DiseñoTacticoDetallado/4.3 Diagrama de
Paquetes.md` ("Componentes PrimeNG reutilizables — envoltorios propios sobre
PrimeNG donde hace falta"), por ejemplo:

- El campo de lectura de credencial (NFC/carnet) con foco automático,
  compartido hoy de forma duplicada en 4 páginas del sistema legacy
  (`PrestamosPage`, `MonitoresPage`, `ReservasPage`, `ReservasSemestralesPage`
  — ver `AulaSync/analisis/estrategia-migracion/frontend.md`).
- El indicador `p-knob` de mora (medidor circular con color progresivo
  verde→amarillo→rojo), también documentado en `frontend.md`.

No se construyen todavía porque ninguna feature existe aún para consumirlos
— se agregan cuando la primera feature real (`Llaves` o `Prestamos`) los
necesite, siguiendo la regla dura de Core: solo sube a `Core` lo que ya está
duplicado o se sabe compartido, no se anticipa.
