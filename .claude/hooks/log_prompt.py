#!/usr/bin/env python3
"""Hook UserPromptSubmit: anota cada prompt en docs/prompts/PROMPTS.md (evidencia de vibe coding)."""
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


MARCAS_NO_HUMANAS = ("<agent-message", "Another Claude session sent a message", "<task-notification", "[SYSTEM NOTIFICATION")


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    prompt = (data.get("prompt") or "").strip()
    if not prompt or any(m in prompt for m in MARCAS_NO_HUMANAS):
        return  # avisos de subagentes/sistema: no son prompts del usuario
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or ".")
    log = root / "docs" / "prompts" / "PROMPTS.md"
    log.parent.mkdir(parents=True, exist_ok=True)
    if not log.exists():
        log.write_text(
            "# Historial de prompts — TransferdeLuxe\n\n"
            "Plataforma: **Claude Code**. Registro automático (hook `UserPromptSubmit`).\n\n",
            encoding="utf-8",
        )
    ahora = datetime.now(ZoneInfo("Europe/Madrid")).strftime("%Y-%m-%d %H:%M")
    sesion = (data.get("session_id") or "")[:8]
    # Sin datos personales reales ni la marca real (bases del hackathon): mismo filtro que las transcripciones.
    try:
        sys.path.insert(0, str(root / "scripts"))
        from anonimizar import anonimizar
        prompt = anonimizar(prompt)
    except Exception:
        pass
    with log.open("a", encoding="utf-8") as f:
        f.write(f"## {ahora} · Claude Code · sesión `{sesion}`\n\n{prompt}\n\n---\n\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # el registro nunca debe bloquear el prompt
