# TODO

# Active track: harness → schema → course generation

Three steps, in order. Each is a separate commit, independently verifiable,
and steps 1–2 make no behavior changes. The destination: course creation as a
conversational **intake session** — the agent interviews the learner (goals,
prior knowledge, uploaded materials) and ends by writing a real course.

## Context for a fresh session

pnpm + turbo monorepo. `apps/` are deployable processes, `packages/` are
libraries. Secrets via Doppler (`doppler run --`); dev servers for web and
the agent worker are usually already running in terminals — check first.

- `apps/web` — Next.js 16 App Router. Chat turns: client composer
  (`src/components/chat/`, assistant-ui `useLocalRuntime` + custom adapter)
  → `src/app/api/sessions/[sessionId]/turns/route.ts` →
  `src/lib/tutor-service.ts` (context assembly + NDJSON streaming) →
  `src/lib/session-store.ts` (sequenced event append)
- `apps/agent` — LiveKit voice worker (rename to `apps/voice` is Step 1):
  `main.ts` (job entry, ad-hoc context assembly), `instructions.ts` (voice
  prompt), `tools.ts` (whiteboard/mastery/checkpoint tools)
- `packages/tutor` — chat turn runtime + prompt (rename to
  `packages/harness` is Step 1); `packages/contracts` — zod event schemas,
  the shared language (additive changes only — existing event types are
  frozen); `packages/db` — Prisma (after schema edits run
  `doppler run -- npx prisma generate` in `packages/db`, migrations via
  `prisma migrate dev`)
- Lesson room (`apps/web/src/components/session/lesson-room.tsx` +
  `tldraw-board.tsx`) is the existing example of an agent-driven surface:
  whiteboard renders by replaying `visual.*` events — Step 3's builder panel
  copies this pattern
- Verification (all from repo root):
  `pnpm --filter web typecheck && pnpm --filter web lint`, then smoke tests
  `pnpm --filter web smoke` (lesson turn), `smoke:chat`, `smoke:pages`,
  `smoke:uploads` (require running dev server + Doppler env)
- Commit per logical chunk, message style per `git log`; check items off
  here as they land

## Step 1 — Harness extraction with session kinds

**Naming first** — make the monorepo self-explanatory
(`apps/` = deployable processes, `packages/` = libraries):

- [x] Rename `apps/agent` → `apps/voice` (`@basics/agent` → `@basics/voice`):
      it is the LiveKit voice worker, nothing more. Update workspace refs,
      turbo filters, dev scripts (`pnpm --filter @basics/voice dev`), and any
      Doppler project/config mapping pointed at the old path
- [x] Rename `packages/tutor` → `packages/harness`
      (`@basics/tutor` → `@basics/harness`): the session runtime. "Tutor" is
      just one persona; the harness will also run intake and assessment

**Why:** the same glue exists twice — `apps/web/src/lib/tutor-service.ts`
(`buildTurnContext`, `loadSessionMaterials`) for chat and
`apps/voice/src/instructions.ts` + `main.ts` for voice — and tools
(`apps/voice/src/tools.ts`, 333 lines) exist only for voice. Course
generation would be a third copy. Instead, one harness in `@basics/harness`
where a session **kind** maps to a configuration.

**Target shape** (new `packages/harness/src/`):

```
kinds.ts     KIND_CONFIGS: { lesson, chat, intake } →
             { buildPrompt(ctx, modality), tools, onComplete? }
context.ts   loadSessionContext(db, sessionId) — one true assembler:
             session + course + lesson + prior events + materials
prompt.ts    unified prompt builder; persona from kind, style rules from
             modality ("voice": short/no-markdown, "text": markdown ok)
tools.ts     tool definitions (zod schema + event-draft producer), pure;
             transports bind them (LiveKit llm.tool / AI SDK tool)
persist.ts   persistTurnEvents() — sequenced append (from web session-store)
```

- [x] `@basics/harness` gains a `@basics/db` dependency; `loadSessionContext`
      replaces web's `buildTurnContext`/`loadSessionMaterials` and the
      voice worker's ad-hoc context assembly in `main.ts`
- [x] Merge `apps/voice/src/instructions.ts` (voice prompt) and
      `packages/harness/src/prompt.ts` (chat prompt) into the kind+modality
      builder — currently two prompts that must agree but can drift
- [x] Move tool *definitions* out of `apps/voice/src/tools.ts`; the voice
      worker keeps only LiveKit bindings, chat runtime can now get tools too
- [ ] **Single-path Mermaid visuals** (the one deliberate behavior change in
      the tool move): `whiteboard_add_diagram` (Mermaid) becomes the *only*
      drawing tool, available to every kind/modality. Delete
      `whiteboard_add_shape` / `whiteboard_add_text` / `whiteboard_draw_path`
      (LLMs are bad at raw 0–100 coordinate layout — that's the
      random-boxes failure) and `set_learner_drawing` + the learner sketch
      pipeline (`describeSketch`, `SKETCH_DATA_TOPIC`, `visual.set_draw_mode`,
      `canDraw` plumbing — board is view-only). Keep `whiteboard_clear`.
      Prompt gets one rule: draw by calling `whiteboard_add_diagram` with
      Mermaid. Render with `@tldraw/mermaid` (`createMermaidDiagram`, native
      editable shapes; we're on tldraw ^5.1) instead of the static-SVG-image
      path in `tldraw-board.tsx`
- [x] Rewire: web turn route + `turnStreamResponse` stay in web (transport);
      `apps/voice/src/main.ts` becomes connect + bind + run
- [ ] **Verify: `smoke`, `smoke:chat`, `smoke:pages`, `smoke:uploads` pass**
      — pure refactor except the deliberate Mermaid-only visuals change
      above (lesson smoke may need its whiteboard assertions updated)

## Step 2 — Schema evolution (one migration)

- [ ] `Session.kind`: `"lesson" | "chat" | "intake"` — today chat-vs-lesson
      is inferred from `lessonId == null`, which breaks at kind #3.
      Backfill: `lessonId != null → "lesson"`, else `"chat"`
- [ ] `ContextSource.courseId` + `ContextSource.lessonId` real columns —
      kills the JSON hack (`content.path: ["courseId"]` filtering in
      `loadSessionMaterials` and the materials page). Lesson attachments =
      ContextSource with `lessonId`, no new table. Backfill from `content`
      JSON; update upload finalize route + materials queries
- [ ] `Course.createdByLearnerId` — ownership for generated courses
      ("Your courses" vs seeded catalog); generated courses use existing
      `status` for `draft → active`
- [ ] `loadSessionContext` materials become:
      (course-scoped) ∪ (lesson-scoped) ∪ (session-attached learner uploads)

## Step 3 — Course generation (intake sessions, split-view builder)

**UX (Mercury "Create Agent" reference):** chat on the left, a rich builder
panel on the right. The agent never makes you type what a click could answer:
it surfaces choices (topic chips, outline cards, confirm/feedback buttons) in
the panel, the user clicks, the click flows back into the conversation as
structured data. The panel accumulates state section by section
(Goal ✓ → Topics ✓ → Outline → Created) until the right side *is* the course.
This is the lesson room's layout with the whiteboard swapped for a builder
surface — same event-log mechanics, different projection.

**Mechanics (one rule: everything flows through the event log):**

- Agent → panel: intake tools emit typed event drafts, the panel is a
  projection over them (exactly how the whiteboard replays `visual.*`):
  - `intake.present_choices` — chips/cards the learner can click
  - `intake.propose_outline` — draft outline card (modules/lessons, editable)
  - `intake.request_confirmation` — "Looks good / I have feedback"
  - `intake.set_progress` — section states for the accumulating panel
- User → agent: panel clicks send a structured learner response
  (`ui.response` event with `{ refEventId, value }`) through the existing
  turn endpoint — same path as a typed message, so it lands in the next
  turn's context as data, not parsed prose. Typing remains a first-class
  escape hatch — the panel accelerates, never gates.
- Persistence/rehydration is free (it's all session events), and voice can
  drive the same panel later via the LiveKit data channel.
- Prior art (don't reinvent component-mapping): AI SDK "Generative UI"
  renders `tool-${name}` message parts as React components; assistant-ui
  (already our chat lib) has `makeAssistantToolUI` for in-thread tool UIs.
  Use assistant-ui's machinery where convenient for in-thread rendering,
  but the right panel renders from *session event state* (whiteboard
  precedent), not from thread messages — that's what makes it reload-safe
  and modality-independent. A clickable component is just: zod tool payload
  → typed event → React component keyed on event type → structured response.

**Tasks:**

- [ ] `intake` kind config in the harness: curriculum-designer persona +
      tools above, plus:
      - `create_course` — zod-validated structured write: Course +
        CourseModules + Lessons (objectives, conceptKeys, estimatedMinutes),
        attaches uploaded materials to the course, marks course active
      - reuse `record_mastery` — intake learns what they already know,
        tutor inherits it in lesson one
- [ ] `intake.*` event types in `@basics/contracts` + a builder-panel
      projection component (rendered from event state; new-event drafts
      already stream over the existing NDJSON turn response)
- [ ] `/courses/new/[sessionId]` (or similar) split-view page: existing chat
      thread components left, builder panel right
- [ ] Home composer: "What do you want to learn?" + attachments → creates
      `kind: "intake"` session → split-view page
- [ ] Uploads before a course exists: presign route is course-scoped today
      (`/api/courses/[courseId]/uploads`) — either presign unscoped and link
      on `create_course`, or create the draft course row up front
- [ ] Finale: `create_course` fires → panel shows the created course →
      redirect to course overview
- [ ] Smoke test: scripted intake conversation (including a `ui.response`
      event) produces a queryable course
- [ ] After: V2's "Your courses" / home sections read `createdByLearnerId`

## Later (unblocked, not now)

- [ ] Move turn execution into the agent worker when we need resumable
      streams / long-running tool loops / background work — after Step 1
      this is a caller change, not a rewrite
- [ ] `assessment` session kind (oral exam + verdict tool) — V3.md Phase 4;
      drops into the same kind registry
- [ ] Organizations (V3.md Phase 1) — orthogonal to all of the above

## Memory management (tutor sessions)

The session event log is append-only and currently grows without bound. Every
time a learner rejoins a lesson, the agent worker loads **all** prior events
for the session and embeds the last 24 transcript lines into its system
prompt. This works for short sessions but degrades as history accumulates:

- Greeting latency grows with prompt size (observed: ~2.5s fresh vs ~5.5s
  after a long session).
- Whiteboard replay re-applies every visual event on every join.
- The LLM context will eventually overflow for long-running lessons.

### Short term

- [ ] Cap events loaded on agent join (e.g. last N transcript events + visual
      events since the last `visual.clear_surface`), instead of the full log.
- [ ] Keep the greeting prompt small: one-line recall summary, not raw
      transcript lines.
- [ ] Add a "start fresh" affordance in the UI that completes the current
      session and creates a new one for the lesson.

### Mid term

- [ ] Rolling session summaries: after every K turns (or on disconnect),
      write a `Summary` row that compresses older transcript into a few
      sentences; the agent loads `summary + recent tail` instead of raw
      history.
- [ ] Event compaction job: periodically snapshot projections (transcript,
      visual state) so rehydration doesn't replay the full event log.
- [ ] Token budget for instructions: measure and enforce a max prompt size,
      trimming history first.

### Long term

- [ ] Cross-session learner memory: persistent profile distilled from
      `MasteryObservation` rows + session summaries (what the learner knows,
      common misconceptions, preferred pace), injected into every new session.
- [ ] Retrieval over past sessions (embed summaries/transcripts, fetch only
      relevant chunks for the current question).
- [ ] Memory writes as first-class agent tool (`remember_fact`) with learner
      visibility/edit controls.

## Other known follow-ups

- [ ] Greeting latency: pre-warm the TTS websocket (currently a pool miss per
      session) and consider a short fixed greeting line that plays while the
      personalized LLM reply generates.
- [ ] tldraw watermark: needs a license for production use.
