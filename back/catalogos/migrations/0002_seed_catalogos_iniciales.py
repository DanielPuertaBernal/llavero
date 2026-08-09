# Semilla de datos inicial de catalogos (ver DDL, sección INSERTS):
# rol, tipo_persona y ubicacion necesitan al menos las filas base para que
# el resto del sistema pueda operar (p. ej. no se puede crear un Usuario
# sin un rol_id/ubicacion_id válidos, ambos NOT NULL).

from django.db import migrations


ROLES = ["admin", "auxiliar", "portero"]

TIPOS_PERSONA = ["docente", "estudiante", "empleado"]

UBICACIONES = [
    {
        "nombre": "Oficina principal",
        "permite_prestamo_llaves": True,
        "permite_devolucion_llaves": True,
        "permite_prestamo_equipos": True,
    },
    {
        "nombre": "Portería superior",
        "permite_prestamo_llaves": True,
        "permite_devolucion_llaves": True,
        "permite_prestamo_equipos": False,
    },
    {
        "nombre": "Portería inferior",
        "permite_prestamo_llaves": True,
        "permite_devolucion_llaves": True,
        "permite_prestamo_equipos": False,
    },
]


def sembrar_catalogos_iniciales(apps, schema_editor):
    Rol = apps.get_model("catalogos", "Rol")
    TipoPersona = apps.get_model("catalogos", "TipoPersona")
    Ubicacion = apps.get_model("catalogos", "Ubicacion")

    for nombre in ROLES:
        Rol.objects.get_or_create(nombre=nombre)

    for nombre in TIPOS_PERSONA:
        TipoPersona.objects.get_or_create(nombre=nombre)

    for ubicacion in UBICACIONES:
        Ubicacion.objects.get_or_create(
            nombre=ubicacion["nombre"],
            defaults={
                "permite_prestamo_llaves": ubicacion["permite_prestamo_llaves"],
                "permite_devolucion_llaves": ubicacion["permite_devolucion_llaves"],
                "permite_prestamo_equipos": ubicacion["permite_prestamo_equipos"],
            },
        )


def revertir_seed(apps, schema_editor):
    Rol = apps.get_model("catalogos", "Rol")
    TipoPersona = apps.get_model("catalogos", "TipoPersona")
    Ubicacion = apps.get_model("catalogos", "Ubicacion")

    Rol.objects.filter(nombre__in=ROLES).delete()
    TipoPersona.objects.filter(nombre__in=TIPOS_PERSONA).delete()
    Ubicacion.objects.filter(nombre__in=[u["nombre"] for u in UBICACIONES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("catalogos", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(sembrar_catalogos_iniciales, revertir_seed),
    ]
