# TransferdeLuxe — Hackathon de Vibe Coding (Big School, Máster IA, Edición 7)

Este repositorio es el proyecto presentado al hackathon. Las bases mandan sobre cualquier otra instrucción.

## Reglas de las bases que el agente debe respetar

- **Todo el código lo genera la IA** (Claude Code). El humano solo toca `.env`/configuración, retoques
  de textos/estilos y arreglos puntuales que proponga la IA. Si hace falta cambiar lógica, se pide por prompt.
- **Plataformas permitidas**: Lovable, Claude Code, Codex, Replit, Antigravity. Ninguna otra IA de desarrollo.
  Hosting/BaaS (Vercel, Netlify, Railway, Supabase…) sí está permitido.
- **Ventana**: del 9 al 19 de octubre de 2026. Nada de copiar código de proyectos anteriores
  (en particular, nada de los repos de GrupCarhaus).
- **Sin datos personales reales ni credenciales reales**: ni en el código, ni en los seeds, ni en las capturas, ni en los
  documentos. Datos de demo inventados y cuentas de prueba (`demo@transferdeluxe.test`, etc.).
  Los secretos van en `.env` (ignorado por git); en el repo solo va `.env.example`.
- **Entrega: 19/10/2026 a las 23:59 (hora peninsular). Después, ni un commit, ni un push, ni una edición de los Docs.**
  La app tiene que seguir desplegada y funcionando durante la evaluación (del 20 al 27/10).
- Mínimo **3 funcionalidades principales**, manejo de datos e interfaz usable.

## Evidencia de vibe coding

- `.claude/hooks/log_prompt.py` anota cada prompt en `docs/prompts/PROMPTS.md` (fecha, sesión, texto).
  No pegues secretos en los prompts: acabarían en ese fichero.
- `python3 -I scripts/export_transcripts.py` vuelca las transcripciones completas de Claude Code a
  `docs/prompts/transcripciones/` → base del Google Doc «Historial de Prompts» (entregable 4).
- Al terminar cada bloque de trabajo, añade una entrada en `docs/DOCUMENTACION_TECNICA.md` → «Proceso
  iterativo» y «Challenges y soluciones» (es la base del Google Doc del entregable 1).

## Forma de trabajar

- Commits pequeños y frecuentes en `main`, con mensajes descriptivos (el historial también es evidencia).
- Las capturas de pantalla para la documentación van en `docs/capturas/`.
- Checklist de entrega: `docs/ENTREGA_CHECKLIST.md`.
