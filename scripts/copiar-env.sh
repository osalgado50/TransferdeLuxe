#!/usr/bin/env bash
# Copia al portapapeles (macOS) cada variable de .env.local, una a una, sin mostrar su valor.
# Uso: bash scripts/copiar-env.sh   → pega cada valor en el panel del hosting y pulsa Intro para la siguiente.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "No existe .env.local"; exit 1; }
VARS=(NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_MODO_DEMO DEMO_PASSWORD CRON_SECRET)
for v in "${VARS[@]}"; do
  valor="$(grep -E "^${v}=" .env.local | head -1 | cut -d= -f2-)"
  if [ -z "$valor" ]; then echo "⚠ $v está vacía en .env.local"; continue; fi
  printf "%s" "$valor" | pbcopy
  read -r -p "📋 Copiado el valor de  $v  (${#valor} caracteres). Pégalo en Hostinger y pulsa Intro… " _
done
printf "" | pbcopy
echo "✔ Hecho. Portapapeles vaciado."
