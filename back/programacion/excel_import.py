"""
excel_import.py — helper de PARSEO/MAPEO puro para la carga masiva de
programación desde un archivo Excel (RF de "cargar programación desde
Excel"). NO es una capa nueva del patrón de 5 archivos (model/repository/
domain/service/controller): es un módulo de soporte que SOLO
`programacion.service` invoca (nunca `controller.py` directamente), igual
que `service.py` es el único punto de entrada del módulo hacia afuera. Este
archivo no toca la base de datos ni conoce `catalogos.service`/
`comunidad.service` — solo sabe leer bytes de un .xlsx y devolver
estructuras de datos ya normalizadas (o levantar `ValueError` con un
mensaje claro por fila/archivo mal formado). Toda la orquestación
(resolver salon/docente/semestre contra los otros módulos, invocar
`crear_programacion` fila por fila, acumular creadas/omitidas) vive en
`service.importar_programacion_desde_excel`, que es quien mantiene la capa
controller → service → repository intacta.

Referencia de mapeo de columnas (SOLO como referencia de negocio, no se
copia código ni se agrega ninguna dependencia de ese proyecto): AulaSync
(Node/Express) `programacion.service.js#importarDesdeExcel` /
`_limpiarProgramacion`, que acepta variantes flexibles de nombre de
columna (mayúsculas/minúsculas, con/sin tildes, nombres cortos y
"amigables") para: identificador del docente (`nroidenti`/
`numero_documento`), `dia`, horario (`horario` combinado o `hora_ini`/
`hora_fin` separados), `aula` y `materia`, más un código de semestre
embebido en el archivo con formato `PAAAA` (1 dígito de período + 4 de
año, ej. `12026` → período 1, año 2026).

Fechas de inicio/fin del semestre embebidas en el archivo (ver
`extraer_fechas_semestre` más abajo): mismo criterio de AulaSync
(`programacion.service.js:401-402`, columnas `fecha_inicio`/
`Fecha Inicio`/`fecha_inicio_semestre` y sus equivalentes de fin) — el
Excel real de programación suele traer estas columnas, y son la fuente
de verdad preferida sobre cualquier fecha tipeada a mano en el formulario
de carga (ver docstring de `service.importar_programacion_desde_excel`
para la decisión de mantener los parámetros manuales como fallback).
"""

import datetime
import io
import re
import unicodedata

import openpyxl

from programacion.domain import DIAS_SEMANA

# ------------------------------------------------------------------
# Mapeo de columnas: nombre normalizado de la celda de encabezado ->
# clave canónica que el resto de este módulo/`service.py` consume.
# ------------------------------------------------------------------

_VARIANTES_COLUMNAS = {
    # docente (identificador de documento)
    "nroidenti": "numero_documento",
    "numero_documento": "numero_documento",
    "numero de documento": "numero_documento",
    "documento": "numero_documento",
    "cedula": "numero_documento",
    # dia
    "dia": "dia",
    "dia de la semana": "dia",
    # horario combinado
    "horario": "horario",
    # horario separado
    "hora_ini": "hora_inicio",
    "hora_inicio": "hora_inicio",
    "hora inicio": "hora_inicio",
    "hora_fin": "hora_fin",
    "hora fin": "hora_fin",
    # aula / salon
    "aula": "aula",
    "salon": "aula",
    # materia
    "materia": "materia",
    "materia de la clase": "materia",
    # semestre
    "semestre": "semestre",
    # fecha de inicio/fin del semestre (embebidas en el archivo, ver
    # docstring del módulo y `extraer_fechas_semestre`)
    "fecha_inicio": "fecha_inicio_semestre",
    "fecha inicio": "fecha_inicio_semestre",
    "fecha_inicio_semestre": "fecha_inicio_semestre",
    "fecha_fin": "fecha_fin_semestre",
    "fecha fin": "fecha_fin_semestre",
    "fecha_fin_semestre": "fecha_fin_semestre",
}


def _sin_tildes(texto: str) -> str:
    """Quita tildes/diacríticos para poder comparar encabezados y valores
    de texto (p. ej. "Día"/"Miércoles") sin depender de que el archivo
    Excel de origen use una codificación consistente de acentos —
    exactamente la misma clase de variación "amigable" de nombres de
    columna que resuelve AulaSync (ver docstring del módulo), aplicada acá
    también a valores de celda de texto (nombres de día).
    """
    return "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )


def _normalizar_encabezado(texto: str) -> str:
    return _sin_tildes(str(texto).strip().lower())


def leer_filas(archivo_bytes: bytes):
    """Lee la primera hoja del `.xlsx` recibido y devuelve una lista de
    `(numero_fila, fila)` donde `numero_fila` es el número de fila real en
    el Excel (1-based, contando el encabezado como fila 1, para que los
    mensajes de "fila omitida" sean los que el usuario ve al abrir su
    propio archivo) y `fila` es un dict con las claves canónicas de
    `_VARIANTES_COLUMNAS` que se hayan reconocido en el encabezado.

    Filas completamente vacías (todas las celdas reconocidas en None) se
    descartan silenciosamente: son huecos de formato del Excel, no datos a
    reportar como omitidos.

    Lanza `ValueError` si el archivo no tiene filas de datos, o si no se
    reconoce NINGUNA columna del encabezado (archivo con un formato
    totalmente distinto al esperado) — en ambos casos no hay nada
    razonable que procesar fila por fila.
    """
    workbook = openpyxl.load_workbook(io.BytesIO(archivo_bytes), data_only=True)
    hoja = workbook.worksheets[0]
    filas_iter = hoja.iter_rows(values_only=True)

    try:
        encabezado = next(filas_iter)
    except StopIteration:
        raise ValueError("El archivo Excel está vacío") from None

    columnas: dict[int, str] = {}
    for indice, celda in enumerate(encabezado or []):
        if celda is None:
            continue
        clave = _VARIANTES_COLUMNAS.get(_normalizar_encabezado(celda))
        if clave is not None:
            columnas[indice] = clave

    if not columnas:
        raise ValueError(
            "No se reconoció ninguna columna esperada en el encabezado del "
            "Excel (se esperaba alguna variante de: numero_documento, dia, "
            "horario/hora_ini/hora_fin, aula, materia, semestre)"
        )

    filas = []
    for numero_fila, valores in enumerate(filas_iter, start=2):
        if valores is None or all(v is None for v in valores):
            continue
        fila = {}
        for indice, clave in columnas.items():
            valor = valores[indice] if indice < len(valores) else None
            if valor is not None:
                fila[clave] = valor
        if fila:
            filas.append((numero_fila, fila))

    if not filas:
        raise ValueError("El archivo Excel no tiene filas de datos")

    return filas


# ------------------------------------------------------------------
# Normalización de valores por celda
# ------------------------------------------------------------------

_DIA_POR_TEXTO = {_sin_tildes(d): d for d in DIAS_SEMANA}


def normalizar_dia(valor) -> str:
    """Mapea el texto de la celda "dia" (con o sin tildes, cualquier
    combinación de mayúsculas/minúsculas) a uno de los 7 valores de
    `DiaSemana`/`domain.DIAS_SEMANA`. Lanza `ValueError` con el valor
    crudo si no coincide con ningún día reconocido."""
    texto = _sin_tildes(str(valor).strip().lower())
    if texto not in _DIA_POR_TEXTO:
        raise ValueError(f'día no reconocido: "{valor}"')
    return _DIA_POR_TEXTO[texto]


def _parsear_hora_individual(valor) -> datetime.time:
    if isinstance(valor, datetime.datetime):
        return valor.time()
    if isinstance(valor, datetime.time):
        return valor
    texto = str(valor).strip()
    for formato in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            return datetime.datetime.strptime(texto, formato).time()
        except ValueError:
            continue
    raise ValueError(f'hora no reconocida: "{valor}"')


def normalizar_horario(fila: dict) -> tuple[datetime.time, datetime.time]:
    """Resuelve `(hora_inicio, hora_fin)` a partir de la fila ya mapeada a
    claves canónicas: prioriza `hora_inicio`/`hora_fin` separadas si están
    presentes (más confiable, sin necesidad de parsear un separador), y
    si no, parte la columna `horario` combinada por los separadores más
    comunes ("A", "-", "a") — mismo criterio de fallback que
    `_limpiarProgramacion` en AulaSync (columna `horario` tipo
    "8:00 A 10:00").

    Lanza `ValueError` si no hay suficiente información para resolver
    ambas horas, o si `hora_inicio >= hora_fin` (mismo chequeo que exige
    el DDL de `Programacion.hora_inicio < hora_fin`, para dar un mensaje
    de fila claro en vez de dejar que el `CheckConstraint` de Postgres
    reviente como un error crudo más abajo).
    """
    if "hora_inicio" in fila and "hora_fin" in fila:
        inicio = _parsear_hora_individual(fila["hora_inicio"])
        fin = _parsear_hora_individual(fila["hora_fin"])
    elif "horario" in fila:
        texto = str(fila["horario"]).strip().upper()
        if " A " in texto:
            partes = texto.split(" A ", 1)
        else:
            partes = texto.split("-", 1)
        if len(partes) != 2:
            raise ValueError(f'horario no reconocido: "{fila["horario"]}"')
        inicio = _parsear_hora_individual(partes[0].strip())
        fin = _parsear_hora_individual(partes[1].strip())
    else:
        raise ValueError("fila sin horario (ni horario combinado ni hora_inicio/hora_fin)")

    if inicio >= fin:
        raise ValueError(f"hora_inicio ({inicio}) debe ser anterior a hora_fin ({fin})")
    return inicio, fin


def normalizar_codigo_semestre(valor) -> str:
    """Convierte el código de semestre embebido en el Excel, formato
    `PAAAA` (1 dígito de período + 4 de año, ej. `12026` → período 1, año
    2026 → `"2026-1"`, mismo formato de `codigo` ya usado por
    `crear_semestre` en este proyecto, ver `test_service.py`), tolerando
    que la celda llegue como número (`12026`) o como texto (`"12026"`).
    Lanza `ValueError` si no matchea el formato de 5 dígitos o si el
    dígito de período no es 1 ni 2.
    """
    texto = str(valor).strip()
    if texto.endswith(".0"):
        texto = texto[:-2]
    if not re.fullmatch(r"\d{5}", texto):
        raise ValueError(
            f'código de semestre no reconocido: "{valor}" (se esperaba '
            "formato PAAAA, ej. 12026 para período 1 de 2026)"
        )
    periodo = int(texto[0])
    anio = int(texto[1:])
    if periodo not in (1, 2):
        raise ValueError(f"período de semestre inválido: {periodo} (solo se admite 1 o 2)")
    return f"{anio}-{periodo}"


# ------------------------------------------------------------------
# Fechas de inicio/fin del semestre embebidas en el archivo
# ------------------------------------------------------------------


def _parsear_fecha_individual(valor) -> datetime.date:
    """Igual criterio que `_parsear_hora_individual`: openpyxl entrega una
    celda con formato de fecha ya como `datetime.datetime`/`datetime.date`
    (según cómo esté formateada la columna en el Excel de origen), pero
    también hay que tolerar que llegue como texto plano."""
    if isinstance(valor, datetime.datetime):
        return valor.date()
    if isinstance(valor, datetime.date):
        return valor
    texto = str(valor).strip()
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    raise ValueError(f'fecha no reconocida: "{valor}"')


def extraer_fechas_semestre(filas):
    """Extrae `(fecha_inicio, fecha_fin)` del semestre a partir de las
    columnas `fecha_inicio`/`Fecha Inicio`/`fecha_inicio_semestre` (e
    idem `fecha_fin`) embebidas en el Excel — ver docstring del módulo y
    AulaSync `programacion.service.js:222-234`.

    `filas` es la lista `(numero_fila, fila)` que devuelve `leer_filas`.

    Devuelve `None` si NINGUNA fila trae ninguna de las dos columnas (el
    Excel no las incluye en absoluto): quien llama (`service.
    importar_programacion_desde_excel`) decide si cae a un fallback
    manual o lanza el mismo `ValueError` de nivel de archivo que AulaSync
    lanza en ese caso ("No se encontraron fechas de inicio o fin del
    semestre en el Excel...").

    Lanza `ValueError` si:
    - una fila trae `fecha_inicio_semestre` sin `fecha_fin_semestre` (o
      viceversa): dato del archivo incompleto, no hay con qué completarlo;
    - el archivo trae más de un rango `(fecha_inicio, fecha_fin)` distinto
      entre filas: mismo criterio de consistencia único ya aplicado al
      código de semestre en `service.importar_programacion_desde_excel`
      (una carga es de UN semestre, no puede traer rangos de fecha
      contradictorios fila a fila);
    - `fecha_inicio >= fecha_fin` en el rango detectado (mismo chequeo que
      exige `model.Semestre.ck_semestre_fechas_validas`, para dar un
      mensaje de archivo claro en vez de un `IntegrityError` crudo más
      abajo).
    """
    rangos: set[tuple[datetime.date, datetime.date]] = set()
    for _, fila in filas:
        tiene_inicio = "fecha_inicio_semestre" in fila
        tiene_fin = "fecha_fin_semestre" in fila
        if not tiene_inicio and not tiene_fin:
            continue
        if tiene_inicio != tiene_fin:
            raise ValueError(
                "fila con fecha de inicio o fin de semestre incompleta: se "
                "encontró una columna sin la otra"
            )
        inicio = _parsear_fecha_individual(fila["fecha_inicio_semestre"])
        fin = _parsear_fecha_individual(fila["fecha_fin_semestre"])
        rangos.add((inicio, fin))

    if not rangos:
        return None
    if len(rangos) > 1:
        raise ValueError(
            "El archivo contiene múltiples rangos de fecha_inicio/fecha_fin "
            "de semestre distintos entre filas; debe ser un único rango "
            "consistente en todo el archivo"
        )
    inicio, fin = rangos.pop()
    if inicio >= fin:
        raise ValueError(
            f"fecha_inicio del semestre ({inicio}) debe ser anterior a "
            f"fecha_fin ({fin})"
        )
    return inicio, fin
