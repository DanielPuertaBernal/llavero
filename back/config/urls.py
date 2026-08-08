"""
URLs raíz del proyecto Llavero.

Monta una única instancia de NinjaAPI en /api/ y agrega ahí los routers
de cada módulo (Django app). Cada módulo expone su router en
`<app>/controller.py` y se agrega aquí con su propio prefijo/tags.
"""

from django.urls import path
from ninja import NinjaAPI

from auth.controller import router as auth_router
from catalogos.controller import router as catalogos_router
from comunidad.controller import router as comunidad_router
from configuracion.controller import router as configuracion_router
from equipos.controller import router as equipos_router
from monitores.controller import router as monitores_router
from programacion.controller import router as programacion_router
from usuarios.controller import router as usuarios_router

api = NinjaAPI(title="Llavero API", version="1.0.0")

api.add_router("/auth", auth_router, tags=["auth"])
api.add_router("/catalogos", catalogos_router, tags=["catalogos"])
# El legacy monta esto en /api/inventario (ver equipos/controller.py);
# acá se usa /api/equipos, consistente con el nombre del módulo.
api.add_router("/equipos", equipos_router, tags=["equipos"])
api.add_router("/usuarios", usuarios_router, tags=["usuarios"])
api.add_router("/comunidad", comunidad_router, tags=["comunidad"])
api.add_router("/programacion", programacion_router, tags=["programacion"])
api.add_router("/monitores", monitores_router, tags=["monitores"])
api.add_router("/configuracion", configuracion_router, tags=["configuracion"])

urlpatterns = [
    path("api/", api.urls),
]
