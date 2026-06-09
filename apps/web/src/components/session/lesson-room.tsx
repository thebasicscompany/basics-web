"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoomEvent, TokenSource } from "livekit-client";
import {
  useAgent,
  useSession,
  useSessionContext,
  useSessionMessages,
} from "@livekit/components-react";
import {
  ArrowLeftIcon,
  ChatTextIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Lesson, Session, SessionEvent } from "@basics/contracts";
import { AgentChatTranscript } from "@/components/agents-ui/agent-chat-transcript";
import { AgentControlBar } from "@/components/agents-ui/agent-control-bar";
import { AgentCaptions } from "@/components/session/agent-captions";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { StartAudioButton } from "@/components/agents-ui/start-audio-button";
import {
  isVisualAction,
  latestTeachingState,
} from "@/components/session/projections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// tldraw can only render in the browser.
const TldrawBoard = dynamic(
  () =>
    import("@/components/session/whiteboard/tldraw-board").then(
      (mod) => mod.TldrawBoard,
    ),
  { ssr: false },
);

const VISUAL_DATA_TOPIC = "basics.visual";
const TEACHING_STATE_DATA_TOPIC = "basics.teaching_state";
const SKETCH_DATA_TOPIC = "basics.sketch";

type LessonRoomProps = {
  session: Session;
  lesson: Lesson | null;
  initialEvents: SessionEvent[];
};

export function LessonRoom({ session, lesson, initialEvents }: LessonRoomProps) {
  const tokenSource = useMemo(
    () => TokenSource.endpoint(`/api/sessions/${session.id}/connection-details`),
    [session.id],
  );
  const livekitSession = useSession(tokenSource);

  return (
    <AgentSessionProvider session={livekitSession}>
      <LessonStage lesson={lesson} initialEvents={initialEvents} />
      <StartAudioButton label="Start audio" />
    </AgentSessionProvider>
  );
}

function LessonStage({
  lesson,
  initialEvents,
}: {
  lesson: Lesson | null;
  initialEvents: SessionEvent[];
}) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  const { state: agentState } = useAgent(session);

  const [events, setEvents] = useState<SessionEvent[]>(initialEvents);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const appendEvents = useCallback((incoming: SessionEvent[]) => {
    setEvents((current) => {
      const known = new Set(current.map((event) => event.id));
      const fresh = incoming.filter((event) => !known.has(event.id));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
  }, []);

  // The agent broadcasts persisted session events (whiteboard actions,
  // teaching state) over the data channel as it works.
  useEffect(() => {
    const room = session.room;
    const decoder = new TextDecoder();

    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== VISUAL_DATA_TOPIC && topic !== TEACHING_STATE_DATA_TOPIC) {
        return;
      }
      try {
        const message = JSON.parse(decoder.decode(payload)) as {
          events?: SessionEvent[];
        };
        if (Array.isArray(message.events)) {
          appendEvents(message.events);
        }
      } catch {
        // Ignore malformed payloads from the data channel.
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [session.room, appendEvents]);

  const visualActions = useMemo(() => events.filter(isVisualAction), [events]);
  const teachingState = useMemo(() => latestTeachingState(events), [events]);

  // The tutor grants/revokes the learner's drawing controls via tool call.
  const canDraw = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type === "visual.set_draw_mode") {
        return event.enabled;
      }
    }
    return false;
  }, [events]);

  // Send the agent a plain-language description of what the learner drew so
  // it can react to the sketch on their next turn.
  const handleSketch = useCallback(
    (description: string) => {
      const localParticipant = session.room.localParticipant;
      if (!session.isConnected || !localParticipant) {
        return;
      }
      void localParticipant
        .publishData(
          new TextEncoder().encode(JSON.stringify({ description })),
          { reliable: true, topic: SKETCH_DATA_TOPIC },
        )
        .catch(() => {
          // Sketch context is best-effort.
        });
    },
    [session.room, session.isConnected],
  );

  async function startLesson() {
    setIsStarting(true);
    setStartError(null);
    try {
      await session.start({
        tracks: { microphone: { enabled: true } },
      });
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "Failed to start the lesson",
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="bg-background relative h-svh w-full overflow-hidden">
      {/* Whiteboard fills the stage */}
      <div className="absolute inset-0">
        <TldrawBoard
          actions={visualActions}
          canDraw={canDraw}
          onSketch={handleSketch}
        />
      </div>

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            aria-label="Back to course"
            render={
              <Link href={lesson ? `/courses/${lesson.courseId}` : "/courses"} />
            }
          >
            <ArrowLeftIcon />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-sm font-semibold tracking-tight">
              {lesson?.title ?? "Lesson"}
            </h1>
            {teachingState?.conceptFocus ? (
              <Badge variant="secondary" className="mt-0.5 max-w-full">
                <span className="truncate">{teachingState.conceptFocus}</span>
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {canDraw && session.isConnected ? (
            <Badge variant="secondary" className="gap-1">
              <PencilSimpleIcon className="size-3" />
              You can draw
            </Badge>
          ) : null}
          {session.isConnected ? (
            <div className="bg-card/85 flex h-8 items-center gap-1.5 rounded-lg border px-2.5 backdrop-blur">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  agentState === "speaking" || agentState === "thinking"
                    ? "animate-pulse bg-primary"
                    : "bg-muted-foreground/50",
                )}
              />
              <span className="text-muted-foreground text-xs capitalize">
                {agentState ?? "connecting"}
              </span>
            </div>
          ) : null}
          <Button
            size="icon"
            variant={transcriptOpen ? "secondary" : "outline"}
            aria-label="Toggle transcript"
            onClick={() => setTranscriptOpen((open) => !open)}
          >
            <ChatTextIcon />
          </Button>
        </div>
      </header>

      {/* Try-this hint */}
      {teachingState?.tryThis && session.isConnected ? (
        <div className="absolute top-20 right-4 z-10 w-72 max-w-[calc(100vw-2rem)]">
          <div className="bg-background/85 rounded-lg border p-3 text-sm shadow-sm backdrop-blur">
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
              Try this
            </p>
            <p>{teachingState.tryThis}</p>
          </div>
        </div>
      ) : null}

      {/* Transcript panel */}
      <aside
        className={cn(
          "bg-background/95 absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l shadow-xl backdrop-blur transition-transform duration-300",
          transcriptOpen ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!transcriptOpen}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Transcript
          </h2>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Close transcript"
            onClick={() => setTranscriptOpen(false)}
          >
            <XIcon />
          </Button>
        </div>
        <PastTranscript events={initialEvents} />
        <AgentChatTranscript
          agentState={agentState}
          messages={messages}
          className="min-h-0 flex-1 [&>div>div]:px-4 [&>div>div]:py-3"
        />
      </aside>

      {/* Start overlay */}
      {!session.isConnected ? (
        <div className="bg-background/70 absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md space-y-4 text-center">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              {lesson?.title ?? "Lesson"}
            </h2>
            {lesson?.summary ? (
              <p className="text-muted-foreground text-sm">{lesson.summary}</p>
            ) : null}
            {lesson && lesson.objectives.length > 0 ? (
              <ul className="text-muted-foreground mx-auto max-w-sm space-y-1 text-left text-sm">
                {lesson.objectives.map((objective) => (
                  <li key={objective} className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button size="lg" onClick={startLesson} disabled={isStarting}>
              {isStarting ? "Connecting..." : "Start lesson"}
            </Button>
            <p className="text-muted-foreground text-xs">
              Talk with your tutor live. You can also type in chat once
              connected.
            </p>
            {startError ? (
              <p className="text-destructive text-sm">{startError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Control bar */}
      {session.isConnected ? (
        <div className="absolute inset-x-0 bottom-0 z-30 pb-4">
          <div className="mx-auto w-full max-w-xl px-4">
            {/* Live caption of the tutor's current utterance */}
            <AgentCaptions
              messages={messages}
              agentState={agentState}
              className="mb-3"
            />
            <AgentControlBar
              variant="livekit"
              controls={{
                leave: true,
                microphone: true,
                chat: true,
                screenShare: true,
                camera: false,
              }}
              isConnected={session.isConnected}
              isChatOpen={chatOpen}
              onIsChatOpenChange={setChatOpen}
              onDisconnect={session.end}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Earlier (persisted) conversation shown above the live transcript. */
function PastTranscript({ events }: { events: SessionEvent[] }) {
  const utterances = events.filter(
    (event) => event.type === "transcript.utterance" && event.isFinal,
  );

  if (utterances.length === 0) {
    return null;
  }

  return (
    <div className="max-h-48 shrink-0 space-y-2 overflow-y-auto border-b px-4 py-3">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        Earlier in this session
      </p>
      {utterances.map((event) =>
        event.type === "transcript.utterance" ? (
          <p key={event.id} className="text-muted-foreground text-sm">
            <span className="font-medium">
              {event.speaker === "tutor" ? "Tutor" : "You"}:
            </span>{" "}
            {event.text}
          </p>
        ) : null,
      )}
    </div>
  );
}
