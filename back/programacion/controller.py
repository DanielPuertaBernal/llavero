"""
controller.py — router de Django Ninja del módulo programacion.

HTTP puro: valida el request (vía los schemas de Ninja), llama a
`service`, formatea la response. Sin lógica de negocio aquí.
"""

import datetime
import uuid

from ninja import File, Form, Router, Schema
from ninja.files import UploadedFile

from programacion import service
from programacion.model import DiaSemana

router = Router()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------


class SemestreOut(Schema):
    id: uuid.UUID
    codigo: str
    fecha_inicio: datetime.date
    fecha_fin: datetime.date


class SemestreIn(Schema):
    codigo: str
    fecha_inicio: datetime.date
    fecha_fin: datetime.date


class ProgramacionOut(Schema):
    id: uuid.UUID
    salon_id: uuid.UUID
    docente_id: uuid.UUID | None
    semestre_id: uuid.UUID
    dia: DiaSemana
    hora_inicio: datetime.time
    hora_fin: datetime.time
    materia: str


class ProgramacionIn(Schema):
    salon_id: uuid.UUID
    docente_id: uuid.UUID | None = None
    semestre_id: uuid.UUID
    dia: DiaSemana
    hora_inicio: datetime.time
    hora_fin: datetime.time
    materia: str


class ImportarOmitidaOut(Schema):
    fila: int
    motivo: str


class ImportarProgramacionOut(Schema):
    creadas: int
    creadas_sin_docente: int
    omitidas: list[ImportarOmitidaOut]
    semestre: SemestreOut


# ------------------------------------------------------------------
# Semestre
# ------------------------------------------------------------------


@router.get("/semestres", response=list[SemestreOut])
def listar_semestres(request):
    return service.listar_semestres()


@router.post("/semestres", response={201: SemestreOut})
def crear_semestre(request, payload: SemestreIn):
    semestre = service.crear_semestre(
        payload.codigo, payload.fecha_inicio, payload.fecha_fin
    )
    return 201, semestre


# ------------------------------------------------------------------
# Programacion
# ------------------------------------------------------------------


@router.get("/", response=list[ProgramacionOut])
def listar_programaciones(request):
    return service.listar_programaciones()


@router.post("/importar", response={200: ImportarProgramacionOut, 400: dict})
def importar_programacion_desde_excel(
    request,
    archivo: UploadedFile = File(...),
    semestre_fecha_inicio: datetime.date | None = Form(None),
    semestre_fecha_fin: datetime.date | None = Form(None),
):
    """Carga masiva de `Programacion` desde un `.xlsx` subido por
    multipart (`archivo`). `semestre_fecha_inicio`/`semestre_fecha_fin`
    son AHORA OPCIONALES (antes obligatorios): el Excel real trae sus
    propias columnas `fecha_inicio`/`fecha_fin` (ver
    `excel_import.extraer_fechas_semestre`), que son la fuente de verdad
    preferida — estos dos parámetros del form quedan solo como fallback
    manual para cuando el archivo no las incluye (ver docstring de
    `service.importar_programacion_desde_excel`). Toda la lógica de
    mapeo/validación/omisión fila por fila vive en
    `service.importar_programacion_desde_excel` — este endpoint es HTTP
    puro: lee el archivo subido a bytes, delega, y traduce el único
    `ValueError` de nivel de archivo (ningún dato reconocible, o ninguna
    fecha de semestre en ninguna de las dos fuentes) a un 400.

    Ojo de registro de rutas: este endpoint se declara ANTES de
    `/{programacion_id}` a propósito — Django Ninja registra los patrones
    de URL en el orden en que se decoran, y el resolver de Django hace
    match por PATH primero (sin importar el método HTTP): si
    `/{programacion_id}` (GET) se registrara antes, `POST /programacion/
    importar` matchearía ese patrón primero (con "importar" como valor
    literal de `programacion_id`) y devolvería 405 en vez de llegar acá.
    """
    try:
        resultado = service.importar_programacion_desde_excel(
            archivo.read(), semestre_fecha_inicio, semestre_fecha_fin
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 200, resultado


@router.get("/{programacion_id}", response={200: ProgramacionOut, 404: dict})
def obtener_programacion(request, programacion_id: uuid.UUID):
    programacion = service.obtener_programacion(programacion_id)
    if programacion is None:
        return 404, {"detail": "Programación no encontrada"}
    return 200, programacion


@router.post("/", response={201: ProgramacionOut, 400: dict})
def crear_programacion(request, payload: ProgramacionIn):
    try:
        programacion = service.crear_programacion(
            payload.salon_id,
            payload.docente_id,
            payload.semestre_id,
            payload.dia,
            payload.hora_inicio,
            payload.hora_fin,
            payload.materia,
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}
    return 201, programacion
