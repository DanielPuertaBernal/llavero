# Llavero

Sistema de gestión de llaves, equipos y salones para la UCO. Reemplaza al sistema actual (AulaSync) para resolver los problemas de trazabilidad, choques de horario y control de préstamos documentados en [`DOC/1. Descubrimiento del problema`](<./DOC/1. Descubrimiento del problema/1. Descripcion del Problema.md>).

## Estructura del repositorio

- [`DOC/`](./DOC/README.md) — documentación completa del proyecto: descubrimiento del problema, diseño estratégico (modelo de dominio, requerimientos) y diseño táctico (arquitectura de referencia, modelo de datos, diagramas de clases/paquetes/componentes).
- [`back/`](./back/README.md) — backend (PostgreSQL + Django Ninja). Aún no construido.
- [`front/`](./front/README.md) — frontend (Angular + TypeScript + PrimeNG). Aún no construido.

## Stack

| | Tecnología |
|---|---|
| Backend | PostgreSQL + Django Ninja |
| Frontend | Angular + TypeScript + PrimeNG |
| Autenticación | Office 365 (Microsoft Entra ID) |
| Lectura de credencial | Lector USB genérico (HID/keyboard-wedge) |
