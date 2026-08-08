"""
URLs raíz del proyecto Llavero.

Monta una única instancia de NinjaAPI en /api/ y agrega ahí los routers
de cada módulo (Django app). Cada módulo expone su router en
`<app>/controller.py` y se agrega aquí con su propio prefijo/tags.
"""

from django.urls import path
from ninja import NinjaAPI

from catalogos.controller import router as catalogos_router

api = NinjaAPI(title="Llavero API", version="1.0.0")

api.add_router("/catalogos", catalogos_router, tags=["catalogos"])

urlpatterns = [
    path("api/", api.urls),
]
