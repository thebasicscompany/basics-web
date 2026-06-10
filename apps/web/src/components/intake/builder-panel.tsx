"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BooksIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react";
import type { SessionEvent } from "@basics/contracts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IntakeEventOf<T extends SessionEvent["type"]> = Extract<
  SessionEvent,
  { type: T }
>;

export type PanelResponse = {
  refEventId: string;
  value: Record<string, unknown> & { kind: string };
  /** Friendly text shown as the learner's bubble in the thread. */
  displayText: string;
};

/**
 * The builder panel: a pure projection over intake.* session events (the
 * whiteboard pattern). Clicks call back with structured ui.response
 * payloads; they never mutate panel state directly — the next event batch
 * re-derives everything.
 */
export function BuilderPanel({
  events,
  busy,
  onRespond,
}: {
  events: SessionEvent[];
  busy: boolean;
  onRespond: (response: PanelResponse) => void;
}) {
  const projection = useMemo(() => project(events), [events]);
  const { progress, outline, courseCreated, actionable } = projection;
  const empty =
    !progress && !outline && !courseCreated && !actionable;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-muted/40">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-6 py-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Course builder
        </p>

        {empty ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-60 text-center text-sm text-muted-foreground">
              Your course takes shape here as you talk it through.
            </p>
          </div>
        ) : null}

        {progress ? <ProgressChecklist sections={progress.sections} /> : null}

        {outline && !courseCreated ? <OutlineCard outline={outline} /> : null}

        {courseCreated ? (
          <CourseCreatedCard event={courseCreated} />
        ) : actionable ? (
          actionable.type === "intake.present_choices" ? (
            <ChoicesPrompt event={actionable} busy={busy} onRespond={onRespond} />
          ) : (
            <ConfirmationPrompt
              event={actionable}
              busy={busy}
              onRespond={onRespond}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

function project(events: SessionEvent[]) {
  let progress: IntakeEventOf<"intake.set_progress"> | undefined;
  let outline: IntakeEventOf<"intake.propose_outline"> | undefined;
  let courseCreated: IntakeEventOf<"intake.course_created"> | undefined;
  let actionable:
    | IntakeEventOf<"intake.present_choices">
    | IntakeEventOf<"intake.request_confirmation">
    | undefined;
  const answered = new Set<string>();

  for (const event of events) {
    switch (event.type) {
      case "intake.set_progress":
        progress = event;
        break;
      case "intake.propose_outline":
        outline = event;
        break;
      case "intake.course_created":
        courseCreated = event;
        break;
      case "intake.present_choices":
      case "intake.request_confirmation":
        actionable = event;
        break;
      case "ui.response":
        answered.add(event.refEventId);
        break;
      case "transcript.utterance":
        // A typed learner reply supersedes the pending panel prompt —
        // typing is always a first-class alternative to clicking.
        if (event.speaker === "learner" && event.isFinal && actionable) {
          answered.add(actionable.id);
        }
        break;
      default:
        break;
    }
  }

  if (actionable && answered.has(actionable.id)) {
    actionable = undefined;
  }

  return { progress, outline, courseCreated, actionable };
}

function ProgressChecklist({
  sections,
}: {
  sections: IntakeEventOf<"intake.set_progress">["sections"];
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <ul className="space-y-2.5">
        {sections.map((section) => (
          <li key={section.id} className="flex items-start gap-2.5">
            {section.status === "done" ? (
              <CheckCircleIcon
                weight="fill"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
            ) : section.status === "active" ? (
              <CircleNotchIcon className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            ) : (
              <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  section.status === "pending" && "text-muted-foreground",
                )}
              >
                {section.label}
              </p>
              {section.summary ? (
                <p className="truncate text-xs text-muted-foreground">
                  {section.summary}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutlineCard({
  outline,
}: {
  outline: IntakeEventOf<"intake.propose_outline">;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="font-heading text-sm font-semibold tracking-tight">
        {outline.title}
      </p>
      {outline.description ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {outline.description}
        </p>
      ) : null}
      <div className="mt-3 space-y-3">
        {outline.modules.map((module, moduleIndex) => (
          <div key={`${module.title}-${moduleIndex}`}>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {module.title}
            </p>
            <ul className="mt-1.5 space-y-1">
              {module.lessons.map((lesson, lessonIndex) => (
                <li
                  key={`${lesson.title}-${lessonIndex}`}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                >
                  <span className="truncate text-sm">{lesson.title}</span>
                  {lesson.estimatedMinutes ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {lesson.estimatedMinutes} min
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChoicesPrompt({
  event,
  busy,
  onRespond,
}: {
  event: IntakeEventOf<"intake.present_choices">;
  busy: boolean;
  onRespond: (response: PanelResponse) => void;
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4">
      <p className="text-sm font-medium">{event.prompt}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {event.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={busy}
            title={choice.description}
            onClick={() =>
              onRespond({
                refEventId: event.id,
                value: {
                  kind: "choices",
                  selected: [choice.id],
                  labels: [choice.label],
                },
                displayText: choice.label,
              })
            }
            className="rounded-full border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {choice.label}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        Click one, or just type your answer in the chat.
      </p>
    </div>
  );
}

function ConfirmationPrompt({
  event,
  busy,
  onRespond,
}: {
  event: IntakeEventOf<"intake.request_confirmation">;
  busy: boolean;
  onRespond: (response: PanelResponse) => void;
}) {
  const confirmLabel = event.confirmLabel ?? "Looks good";
  const rejectLabel = event.rejectLabel ?? "I have feedback";

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4">
      <p className="text-sm font-medium">{event.prompt}</p>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            onRespond({
              refEventId: event.id,
              value: { kind: "confirmation", approved: true, label: confirmLabel },
              displayText: confirmLabel,
            })
          }
        >
          <CheckIcon className="size-4" />
          {confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            onRespond({
              refEventId: event.id,
              value: { kind: "confirmation", approved: false, label: rejectLabel },
              displayText: rejectLabel,
            })
          }
        >
          {rejectLabel}
        </Button>
      </div>
    </div>
  );
}

function CourseCreatedCard({
  event,
}: {
  event: IntakeEventOf<"intake.course_created">;
}) {
  return (
    <div className="rounded-xl border border-primary/40 bg-card p-5 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <BooksIcon weight="fill" className="size-5" />
      </div>
      <p className="mt-3 font-heading text-base font-semibold tracking-tight">
        {event.title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {event.moduleCount} module{event.moduleCount === 1 ? "" : "s"} ·{" "}
        {event.lessonCount} lesson{event.lessonCount === 1 ? "" : "s"} — taking
        you there...
      </p>
      <Button
        size="sm"
        className="mt-4"
        render={<Link href={`/courses/${event.courseId}`} />}
      >
        Go to course
        <ArrowRightIcon className="size-4" />
      </Button>
    </div>
  );
}
