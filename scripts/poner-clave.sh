#!/usr/bin/env bash
# Guarda una clave en .env.local sin que aparezca en pantalla ni en el historial.
# Uso: bash scripts/poner-clave.sh [NOMBRE_VARIABLE]   (por defecto SUPABASE_SERVICE_ROLE_KEY)
set -euo pipefail
cd "$(dirname "$0")/.."
VAR="${1:-SUPABASE_SERVICE_ROLE_KEY}"
[ -f .env.local ] || cp .env.example .env.local
printf "Pega el valor de %s y pulsa Intro (no se verá): " "$VAR"
read -rs VALOR
echo
[ -n "$VALOR" ] || { echo "Valor vacío; no se ha cambiado nada."; exit 1; }
VAR="$VAR" VALOR="$VALOR" python3 -I - <<'PY'
import os, re
var, valor = os.environ["VAR"], os.environ["VALOR"].strip()
ruta = ".env.local"
texto = open(ruta, encoding="utf-8").read()
linea = f"{var}={valor}"
if re.search(rf"^{re.escape(var)}=.*$", texto, flags=re.M):
    texto = re.sub(rf"^{re.escape(var)}=.*$", lambda _: linea, texto, flags=re.M)
else:
    texto = texto.rstrip("\n") + "\n" + linea + "\n"
open(ruta, "w", encoding="utf-8").write(texto)
PY
git check-ignore -q .env.local && echo "✔ $VAR guardada en .env.local (ignorado por git)." || echo "⚠ .env.local NO está ignorado por git: revísalo."
