"""Anonimización del historial de prompts y de las transcripciones (bases del hackathon: sin datos personales reales ni
la marca real de la empresa en la que se inspira el proyecto). La usan el hook que anota los prompts y
scripts/export_transcripts.py."""
import re
from pathlib import Path

# Literales sensibles (marca real, nombres, direcciones, contraseñas antiguas) en un fichero local ignorado por git, para
# que este script no los publique. Formato por línea: regex<TAB>flags (i)<TAB>sustitución.
_LOCAL = Path(__file__).resolve().parent / "anonimizar.local.tsv"


def _locales():
    if not _LOCAL.exists():
        return []
    out = []
    for linea in _LOCAL.read_text(encoding="utf-8").splitlines():
        if linea.strip() and not linea.startswith("#"):
            patron, flags, sust = linea.split("\t")
            out.append((re.compile(patron, re.I if "i" in flags else 0), sust))
    return out


ANONIMIZAR = _locales() + [
    # Contacto real: correos (salvo los de prueba) y teléfonos móviles/fijos (salvo los ficticios 600 000 xxx).
    (re.compile(r"\b[\w.+-]+@(?!(?:[\w-]+\.)*(?:test|ejemplo\.test|example\.(?:com|org)|thebigschool\.com)\b)[\w-]+(?:\.[\w-]+)+\b"), "[email omitido]"),
    (re.compile(r"(?<![\d-])(?:\+34[ .]?)?(?!600[ .]?000)[6789]\d{2}[ .]?\d{3}[ .]?\d{3}(?![\d-])"), "[teléfono omitido]"),
    (re.compile(r"(?<![\d-])(?:\+34[ .]?)?(?!600[ .]?00)[6789]\d{2}(?:[ .]\d{2}){3}(?![\d-])"), "[teléfono omitido]"),
]


def anonimizar(t: str) -> str:
    for patron, sust in ANONIMIZAR:
        t = patron.sub(sust, t)
    return t
