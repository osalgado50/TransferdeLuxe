#!/usr/bin/env python3
"""Vuelca las transcripciones de Claude Code de este proyecto a Markdown legible.

Uso:  python3 -I scripts/export_transcripts.py [--solo-prompts]
Salida: docs/prompts/transcripciones/<fecha>_<sesion>.md
"""
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
SRC = Path.home() / ".claude" / "projects" / str(ROOT).replace("/", "-").replace(" ", "-")
OUT = ROOT / "docs" / "prompts" / "transcripciones"
TZ = ZoneInfo("Europe/Madrid")


def texto(content):
    """Devuelve el texto de un mensaje; ignora tool_use/tool_result/thinking."""
    if isinstance(content, str):
        return content.strip()
    partes = [b.get("text", "") for b in content or [] if isinstance(b, dict) and b.get("type") == "text"]
    return "\n\n".join(p.strip() for p in partes if p.strip())


def hora(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(TZ).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return ""


def exportar(jsonl, solo_prompts):
    bloques, inicio = [], None
    for linea in jsonl.read_text(encoding="utf-8").splitlines():
        try:
            ev = json.loads(linea)
        except json.JSONDecodeError:
            continue
        if ev.get("isMeta") or ev.get("type") not in ("user", "assistant"):
            continue
        t = texto((ev.get("message") or {}).get("content"))
        if not t or t.startswith("<"):  # avisos del sistema, comandos internos
            continue
        h = hora(ev.get("timestamp", ""))
        inicio = inicio or h
        if ev["type"] == "user":
            bloques.append(f"### 🧑 Prompt · {h}\n\n{t}\n")
        elif not solo_prompts:
            bloques.append(f"**🤖 Claude Code:**\n\n{t}\n")
    if not bloques:
        return None
    nombre = f"{(inicio or 'sin-fecha')[:10]}_{jsonl.stem[:8]}.md"
    cab = f"# Sesión Claude Code `{jsonl.stem[:8]}` — {inicio}\n\nPlataforma: **Claude Code**\n\n"
    (OUT / nombre).write_text(cab + "\n".join(bloques), encoding="utf-8")
    return nombre


def main():
    solo = "--solo-prompts" in sys.argv
    if not SRC.is_dir():
        sys.exit(f"No hay transcripciones en {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob("*.jsonl")):
        n = exportar(f, solo)
        if n:
            print("→", OUT / n)


if __name__ == "__main__":
    main()
