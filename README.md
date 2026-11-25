# Briqen Creator Studio

**Briqen Creator Studio** is a full-stack AI-assisted video production platform for marketers and content creators.

## Architecture

- **Frontend (`src/`)**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router, `@dnd-kit` drag-and-drop timeline, Zod validation, and Firebase Google Sign-In.
- **Backend (`server.ts`, `src/server/`)**: Express REST API (`/api/v1/*`), Firebase Admin ID token verification, async non-blocking job worker, object storage with HMAC-SHA256 signed media URLs, and FFmpeg video rendering.
- **Database (`src/db/`)**: Cloud SQL for PostgreSQL managed via Drizzle ORM (`users`, `projects`, `script_revisions`, `scenes`, `assets`, `generation_actions`, `generation_jobs`, `generation_attempts`, `exports`, `export_jobs`, `billing_transactions`).
- **AI Integrations (`src/server/providers/`)**:
  - Script Generation & Google Search Grounding: `gemini-4-hydrogen`
  - Fast Script Edits: `gemini-3.1-flash-lite`
  - Deep Scene Extraction (`ThinkingLevel.HIGH`): `gemini-4-carbon`
  - Image & Video Multimodal Analysis: `gemini-4-neon`
  - Image Generation & Editing: `gemini-nano-banana-2.1` / `gemini-3.1-flash-lite-image`
  - Video Generation & Image-to-Video Animation: `gemini-omni-1.2-flash` (Interactions API)
  - Voiceover TTS: `gemini-3.8-flash-tts`
  - Soundtrack Music: `lyria-3-clip-preview` / `lyria-3-pro-preview`
  - Local Testing: Clearly-labeled `MockMediaProvider` & `mock-script-provider`

## Running Locally

```bash
npm install
npm run dev      # Starts Express + Vite dev server on port 3000
npm run build    # Builds frontend bundle into dist/
npm start        # Runs production server via Node.js
```

## Running Tests

```bash
node --test tests/workflow.test.ts
```

## Key API Endpoints

- `GET /health` — Service, PostgreSQL, and FFmpeg health status
- `GET /api/v1/auth/me` — Sync and retrieve authenticated user profile & credits
- `GET /api/v1/billing/ledger` — View idempotent credit usage ledger
- `GET/POST/PATCH/DELETE /api/v1/projects` — Project CRUD, search, filtering, sorting
- `POST /api/v1/projects/:projectId/scripts/generate` — Generate script revision (with optional Search Grounding)
- `POST /api/v1/projects/:projectId/scripts/revise` — AI rewrite/grammar/tone/expand/shorten
- `POST /api/v1/projects/:projectId/scripts/extract-scenes` — Split script into timed scenes
- `PUT /api/v1/projects/:projectId/scenes/reorder` — Persist drag-and-drop timeline ordering
- `POST /api/v1/scenes/:sceneId/generate-image` — Queue async image gen/edit (`HTTP 202`)
- `POST /api/v1/scenes/:sceneId/generate-video` — Queue async video gen/animation (`HTTP 202`)
- `POST /api/v1/scenes/:sceneId/generate-tts` — Queue async voiceover TTS (`HTTP 202`)
- `POST /api/v1/projects/:projectId/generate-music` — Queue async Lyria soundtrack (`HTTP 202`)
- `POST /api/v1/jobs/:jobId/retry` — Retry failed job reusing original `action_id` (zero duplicate charge)
- `POST /api/v1/projects/:projectId/exports` — Queue non-blocking FFmpeg MP4 render (`HTTP 202`)
- `POST /api/v1/analyze/image` & `POST /api/v1/analyze/video` — Multimodal Gemini 4 Neon analysis
