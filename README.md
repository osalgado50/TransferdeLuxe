# TransferdeLuxe

Proyecto para el **Hackathon de Vibe Coding — Máster en IA de Big School (Edición 7)**,
desarrollado al 100 % con vibe coding usando **Claude Code**.

> Descripción, demo y credenciales de prueba: pendientes.

## Evidencia del desarrollo
- `docs/prompts/PROMPTS.md`: registro automático de cada prompt.
- `docs/prompts/transcripciones/`: transcripciones exportadas de las sesiones de Claude Code.
- `docs/DOCUMENTACION_TECNICA.md`: borrador de la documentación técnica.

## Puesta en marcha

```bash
cp .env.example .env.local   # rellenar con tus claves (nunca se suben a git)
npm i
npm run seed
npm run dev
```

## Tests E2E

```bash
npm run test:e2e   # resiembra la demo (globalSetup) y ejecuta Playwright; reutiliza el servidor en :3000 si ya corre
```

Requiere `.env.local` con `DEMO_PASSWORD`. Cubre el flujo reserva → asignación → aceptación → carga → descarga y el rechazo con alerta en la central.
