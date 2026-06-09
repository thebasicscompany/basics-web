# TODO

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
- [ ] Learner sketch descriptions are geometric ("a rectangle near 40%...");
      consider sending a board screenshot to a vision model for richer
      context.
