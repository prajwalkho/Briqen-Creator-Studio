# Briqen Creator Studio

**Briqen Creator Studio** is a full-stack AI-assisted video production platform for marketers and content creators.

## Architecture

- **Frontend (`src/`)**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router, `@dnd-kit` drag-and-drop timeline, Zod validation, and Firebase Google Sign-In.
- **Backend (`server.ts`, `src/server/`)**: Express REST API (`/api/v1/*`), JWT + refresh rotation auth, Firebase Admin ID token verification, async non-blocking job worker, local object storage with HMAC-SHA256 signed media URLs, and FFmpeg video rendering.
- **Database (`src/db/`)**: Cloud SQL for PostgreSQL managed via Drizzle ORM (`users`, `projects`, `script_revisions`, `scenes`, `assets`, `generation_actions`, `generation_jobs`, `generation_attempts`, `exports`, `export_jobs`, `billing_transactions`).

## Provider-Independent AI System (`src/server/ai/`)

All five AI capabilities use clean provider interfaces and an environment-driven factory (`src/server/ai/factory.ts`) so models/providers can be switched without rewriting business logic:

- **Interfaces (`src/server/ai/interfaces/`)**:
  - `LLMProvider`: script generation, script improvement (`rewrite`, `grammar`, `clarity`, `engaging`, `tone`, `expand`, `shorten`, `alternative`), and Zod-validated JSON scene extraction.
  - `ImageProvider`: image generation/editing (`16:9`, `9:16`, `1:1`) with capability metadata.
  - `VideoProvider`: text-to-video & image-to-video (`16:9`, `9:16`, `3–15s`) with capability metadata.
- **Adapters (`src/server/ai/providers/`)**:
  - **Gemini**: `gemini-4-hydrogen` (script + Search Grounding), `gemini-3.1-flash-lite` (fast polish), `gemini-4-carbon` (scene extraction), `gemini-nano-banana-2.1` / `gemini-3.1-flash-lite-image` (images), `gemini-omni-1.2-flash` via Interactions API (video), `gemini-3.8-flash-tts` (TTS), `lyria-3-*` (music).
  - **OpenAI**: `gpt-4o-mini` (LLM chat & structured JSON scene extraction), `dall-e-3` (images), and optional `OPENAI_VIDEO_ENDPOINT` (otherwise fails explicitly with `ProviderCapabilityError`).
  - **Mock**: Deterministic offline adapters + FFmpeg synthesis for automated testing and zero-cost development (always clearly labeled as simulated mock output).

### Environment Variables

```bash
LLM_PROVIDER=gemini          # gemini | openai | mock
IMAGE_PROVIDER=gemini        # gemini | openai | mock
VIDEO_PROVIDER=gemini        # gemini | openai | mock
AI_REQUEST_TIMEOUT=120       # seconds before in-flight job times out
AI_MAX_RETRIES=3
GEMINI_API_KEY=...
OPENAI_API_KEY=...
OPENAI_VIDEO_ENDPOINT=...    # optional; required if VIDEO_PROVIDER=openai
```

### Adding a New AI Provider

1. Implement `LLMProvider`, `ImageProvider`, or `VideoProvider` from `src/server/ai/interfaces/` in a new file under `src/server/ai/providers/<capability>/`.
2. Add the provider identifier to `src/server/ai/config.ts` and `src/server/ai/schemas.ts`.
3. Register the new adapter inside `src/server/ai/factory.ts`.

### Background Job Worker & Reliability

- `POST /api/v1/ai/images/generate` and `POST /api/v1/ai/videos/generate` return `HTTP 202` immediately and dispatch execution asynchronously in `src/server/workers/jobWorker.ts`.
- Enforces per-request `AbortController` timeouts (`timed_out`), progress tracking (`0–100`), cooperative cancellation (`POST /api/v1/ai/jobs/:jobId/cancel`), and late-response protection (`stale_ignored` if user already cancelled or accepted another asset).
- **Technical Retry vs Regeneration**: `POST /api/v1/ai/jobs/:jobId/retry` reuses the original `action_id` with zero duplicate billing charges, whereas `POST /api/v1/scenes/:sceneId/regenerate` creates a new `action_id`.
- **Provider Limitations**: Real Gemini Nano Banana (`gemini-nano-banana-2.1`) and Omni (`gemini-omni-1.2-flash`) calls require a billing-enabled `GEMINI_API_KEY`. OpenAI video generation requires `OPENAI_VIDEO_ENDPOINT`.

## Running Locally & Testing

```bash
npm install
npm run dev      # Starts Express + Vite dev server on port 3000
npm run build    # Builds frontend bundle into dist/
npm start        # Runs production server via Node.js

# Run automated test suite (mock/offline mode works without external API keys)
node --test tests/auth.test.ts tests/workflow.test.ts tests/ai.test.ts
```

## Key API Endpoints

- `GET /health` — Service, PostgreSQL, FFmpeg, and active AI provider summary
- `GET /api/v1/ai/providers` — Provider capabilities, mock flags, and configured key status
- `POST /api/v1/ai/scripts/generate` — Generate structured script revision
- `POST /api/v1/ai/scripts/:scriptId/improve` — Improve existing script while preserving original revision
- `GET /api/v1/ai/scripts/:scriptId/revisions` — List immutable script revision history
- `POST /api/v1/ai/scenes/extract` — Extract Zod-validated structured JSON scenes into PostgreSQL
- `PATCH /api/v1/ai/scenes/:sceneId` — Update scene narration, prompts, timing, or transition
- `POST /api/v1/ai/images/generate` & `GET /api/v1/ai/images/jobs/:jobId` — Async scene image generation
- `POST /api/v1/ai/videos/generate` & `GET /api/v1/ai/videos/jobs/:jobId` — Async text-to-video / image-to-video generation
- `POST /api/v1/ai/jobs/:jobId/retry` & `POST /api/v1/ai/jobs/:jobId/cancel` — Free retry & cancellation
- `POST /api/v1/ai/assets/:assetId/accept` & `POST /api/v1/ai/assets/:assetId/reject` — Accept/reject scene media
- `POST /api/v1/projects/:projectId/exports` — Queue non-blocking FFmpeg MP4 render (`HTTP 202`)
