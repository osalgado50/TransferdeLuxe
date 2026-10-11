#!/usr/bin/env bash
# Publica una actualización automática (EAS Update) de TVL Conductor para Android (preview) e iPhone (production).
# Solo cambios JS/pantallas; si cambia algo nativo, la huella no coincide y hace falta una compilación nueva.
set -euo pipefail
cd "$(dirname "$0")/../movil"
MSG="${1:-Actualización}"
npx eas-cli@latest update --channel preview --environment preview --message "$MSG" --non-interactive
npx eas-cli@latest update --channel production --environment production --message "$MSG" --non-interactive
