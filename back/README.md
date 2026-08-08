# Llavero — Backend

Backend de Llavero. Stack: **Python + Django + django-ninja + PostgreSQL** (driver `psycopg[binary]`), monolito modular con 5 capas fijas por módulo (`model.py` / `repository.py` / `domain.py` / `service.py` / `controller.py`) — un módulo = una Django app = un dominio.

Ver el diseño completo en [`../DOC/`](../DOC/README.md):
- Requerimientos: `DOC/2. Diseño estratégico/2.2 Requerimientos.md`
- Modelo de datos (MER): `DOC/4. DiseñoTacticoDetallado/4.1 Modelo de Datos.md`
- DDL: `DOC/4. DiseñoTacticoDetallado/4.5 DDL.sql`
- Diagrama de clases: `DOC/4. DiseñoTacticoDetallado/4.2 Diagrama de clases.md`
- Diagrama de componentes: `DOC/4. DiseñoTacticoDetallado/4.4 Diagrama de Componentes.md`

## Instalación

```bash
cd back
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Variables de entorno

Copia `env.example` como `.env` (mismo directorio, `back/.env`, gitignorado) y completa los valores reales:

```bash
cp env.example .env
```

> Nota: el archivo de ejemplo se llama `env.example` (sin el punto inicial) porque el entorno de desarrollo con el que se generó este scaffold bloquea la creación de archivos `.env*` como medida de seguridad. Renómbralo tú a `.env.example` si quieres seguir la convención habitual — el contenido es el mismo, y `.gitignore` ya ignora cualquiera de las dos variantes de nombre real (`.env`).

Claves esperadas: `DEBUG`, `SECRET_KEY`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `ALLOWED_HOSTS`.

## Base de datos y migraciones

Con Postgres corriendo y accesible según lo configurado en `.env`:

```bash
python manage.py migrate
```

La migración `catalogos/migrations/0002_seed_catalogos_iniciales.py` siembra los datos base del DDL (roles, tipos de persona, ubicaciones) automáticamente al migrar — no hace falta un comando aparte.

## Tests

TDD estricto: para cada pieza de lógica no trivial, el test se escribe antes que la implementación. Los tests de `repository.py` corren contra una base de datos de test real (Postgres), no contra mocks — `pytest-django` crea y destruye la base de test automáticamente usando la conexión de `.env`.

```bash
pytest -v
```

## Arranque en desarrollo

```bash
python manage.py runserver
```

La API queda montada en `http://localhost:8000/api/` (una única instancia de `NinjaAPI`, con el router de cada módulo agregado ahí — por ahora solo `catalogos`, bajo `/api/catalogos/...`). Documentación interactiva autogenerada en `http://localhost:8000/api/docs`.

## Convención de módulos (monolito modular)

Cada dominio es una Django app independiente, con exactamente 5 archivos fijos:

| Archivo | Responsabilidad |
|---|---|
| `model.py` | Modelos ORM |
| `repository.py` | Única capa que toca el ORM — métodos de intención, no wrappers genéricos |
| `domain.py` | Funciones puras (sin DB, sin I/O) |
| `service.py` | Orquesta `domain` + `repository`; API pública del módulo |
| `controller.py` | Router de Django Ninja — HTTP puro, sin lógica de negocio |

**Regla dura sin excepción**: ningún módulo importa `model.py`/`repository.py` de otro módulo — solo su `service.py`.
