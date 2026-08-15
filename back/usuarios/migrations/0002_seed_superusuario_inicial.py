# Semilla del primer usuario admin: sin ella, nadie puede iniciar sesión la
# primera vez (el login de Office 365 solo vincula oid_microsoft a un
# Usuario que ya exista por email_institucional, ver usuarios/model.py y
# auth/service.py — no hay creación de cuentas desde el propio login).
# Lee el email de settings.SUPERUSUARIO_EMAIL (ver env.example); si está
# vacío, no hace nada (no falla el migrate en entornos donde aún no se
# configuró).

from django.conf import settings
from django.db import migrations

from usuarios.domain import normalizar_email


def sembrar_superusuario_inicial(apps, schema_editor):
    email = settings.SUPERUSUARIO_EMAIL
    if not email:
        return
    email = normalizar_email(email)

    Rol = apps.get_model("catalogos", "Rol")
    Ubicacion = apps.get_model("catalogos", "Ubicacion")
    Usuario = apps.get_model("usuarios", "Usuario")

    rol_admin = Rol.objects.get(nombre="admin")
    ubicacion_inicial = Ubicacion.objects.get(nombre="Oficina principal")

    Usuario.objects.get_or_create(
        email_institucional=email,
        defaults={
            "nombre": "Administrador",
            "rol": rol_admin,
            "ubicacion": ubicacion_inicial,
            "activo": True,
        },
    )


def revertir_seed(apps, schema_editor):
    email = settings.SUPERUSUARIO_EMAIL
    if not email:
        return
    email = normalizar_email(email)

    Usuario = apps.get_model("usuarios", "Usuario")
    Usuario.objects.filter(email_institucional=email, oid_microsoft__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("usuarios", "0001_initial"),
        ("catalogos", "0002_seed_catalogos_iniciales"),
    ]

    operations = [
        migrations.RunPython(sembrar_superusuario_inicial, revertir_seed),
    ]
