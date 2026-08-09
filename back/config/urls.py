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
from llaves.controller import router as llaves_router
from monitores.controller import router as monitores_router
from nfc.controller import router as nfc_router
from notificaciones.controller import router as notificaciones_router
from novedades.controller import router as novedades_router
from prestamos.controller import router as prestamos_router
from programacion.controller import router as programacion_router
from reservas.controller import router as reservas_router
from reservas_semestrales.controller import router as reservas_semestrales_router
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
api.add_router("/novedades", novedades_router, tags=["novedades"])
api.add_router("/reservas", reservas_router, tags=["reservas"])
api.add_router("/reservas-semestrales", reservas_semestrales_router, tags=["reservas_semestrales"])
api.add_router("/llaves", llaves_router, tags=["llaves"])
api.add_router("/configuracion", configuracion_router, tags=["configuracion"])
api.add_router("/notificaciones", notificaciones_router, tags=["notificaciones"])
api.add_router("/prestamos", prestamos_router, tags=["prestamos"])
api.add_router("/nfc", nfc_router, tags=["nfc"])

urlpatterns = [
    path("api/", api.urls),
]
