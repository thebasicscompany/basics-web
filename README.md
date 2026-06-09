# Basics (web)

AI tutoring platform: live voice tutoring over LiveKit, a shared whiteboard the tutor draws on, durable session transcripts, and mastery tracking. Web rebuild of the Basics desktop prototype.

## Stack

- **apps/web** — Next.js (App Router) + shadcn/ui + Clerk auth + LiveKit Agents UI. The lesson view is an immersive LiveKit session: fullscreen whiteboard, floating agent control bar, slide-out transcript.
- **apps/voice** — LiveKit Agents (Node.js) voice tutor worker. STT/LLM/TTS pipeline with tools for whiteboard drawing, teaching state, mastery, and checkpoints. Persists everything to the session event log and broadcasts events to the room over data channels.
- **packages/contracts** — Zod schemas: namespaced IDs, the append-only `SessionEvent` union, courses/lessons/sessions.
- **packages/db** — Prisma + Postgres. Event-sourced sessions with projection tables and the shared `appendSessionEvents` event store.
- **packages/harness** — session runtime (`TutorRuntime` interface, AI SDK implementation) used by the NDJSON turn API.

## Getting started

Secrets live in Doppler (`backend` project, `dev_basics-web` config). The repo is pre-scoped via `doppler.yaml`:

```sh
pnpm install
doppler setup --no-interactive   # one-time, requires doppler login
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm --filter @basics/voice download-files   # one-time: VAD + turn-detector models
pnpm dev                                     # web + voice worker
```

Open http://localhost:3000, sign up, pick a course, start a lesson, and talk.

## Architecture notes

- The session event log is canonical. The transcript, whiteboard, teaching-state panel, checkpoints, and mastery records are all projections of `SessionEvent` rows.
- Voice flow: the lesson page mints a LiveKit token (`/api/sessions/[id]/connection-details`) whose room config dispatches the `basics-tutor` agent with the session id in its job metadata. The agent loads the session + lesson from Postgres, builds instructions, and joins the room.
- The agent's tool calls (whiteboard, teaching state, mastery, checkpoints) are appended to the event log in one transaction, then broadcast to the room on the `basics.visual` / `basics.teaching_state` data topics; the client renders them live and rehydrates from the log on reload.
- Voice transcripts are persisted as `transcript.utterance` events as the conversation happens.
- AI SDK types never leave `packages/harness`; LiveKit agent types never leave `apps/voice`. The UI and API consume only contract types.
