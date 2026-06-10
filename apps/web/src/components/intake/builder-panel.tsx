"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BooksIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react";
import type { IntakeStepId, KnowledgeLevel, SessionEvent } from "@basics/contracts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IntakeEventOf<T extends SessionEvent["type"]> = Extract<
  SessionEvent,
  { type: T }
>;

type ActionableEvent =
  | IntakeEventOf<"intake.present_choices">
  | IntakeEventOf<"intake.assess_knowledge">
  | IntakeEventOf<"intake.request_confirmation">;

export type PanelResponse = {
  refEventId: string;
  value: Record<string, unknown> & { kind: string };
  /** Friendly text shown as the learner's bubble in the thread. */
  displayText: string;
};

/** The canonical stepper frame — fixed in code, filled by the agent. */
const STEPS: { id: IntakeStepId; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "prior_knowledge", label: "Prior knowledge" },
  { id: "scope", label: "Scope" },
  { id: "outline", label: "Outline" },
  { id: "created", label: "Created" },
];

type StepState = {
  status: "pending" | "active" | "done";
  summary?: string;
};

/**
 * The builder panel: a Mercury-style stepper, derived purely from intake.*
 * session events (the whiteboard pattern). Completed steps collapse to a
 * check + summary; the active step expands with the agent's interactive
 * content; clicks flow back as structured ui.response turns.
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
  const { stepStates, actionable, outline, courseCreated, activeStepId } =
    projection;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-muted/40">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-6">
        <p className="mb-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Course builder
        </p>

        <div className="flex flex-col gap-2">
          {STEPS.map((step) => {
            const state = stepStates[step.id];
            const isActive = step.id === activeStepId && !courseCreated;
            const stepActionable =
              actionable && placementOf(actionable, activeStepId) === step.id
                ? actionable
                : undefined;

            // The created step renders its card once the course exists.
            if (step.id === "created") {
              return (
                <StepCard
                  key={step.id}
                  label={step.label}
                  state={
                    courseCreated
                      ? { status: "done", summary: courseCreated.title }
                      : state
                  }
                  expanded={Boolean(courseCreated)}
                >
                  {courseCreated ? (
                    <CourseCreatedCard event={courseCreated} />
                  ) : null}
                </StepCard>
              );
            }

            const showOutline =
              step.id === "outline" && outline && !courseCreated;
            const expanded = Boolean(
              (isActive && (stepActionable || busy)) || showOutline,
            );

            return (
              <StepCard
                key={step.id}
                label={step.label}
                state={state}
                expanded={expanded}
              >
                {showOutline ? <OutlineCard outline={outline} /> : null}
                {stepActionable && !busy ? (
                  <ActionableContent
                    event={stepActionable}
                    onRespond={onRespond}
                  />
                ) : null}
                {isActive && busy && !stepActionable ? (
                  <p className="px-4 pb-4 text-xs text-muted-foreground">
                    Working on it...
                  </p>
                ) : null}
              </StepCard>
            );
          })}
        </div>

        {!courseCreated ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Click to answer, or just type in the chat — both work.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function placementOf(
  event: ActionableEvent,
  activeStepId: IntakeStepId,
): IntakeStepId {
  return event.sectionId ?? activeStepId;
}

function project(events: SessionEvent[]) {
  const stepStates = Object.fromEntries(
    STEPS.map((step) => [
      step.id,
      { status: step.id === "focus" ? "active" : "pending" } as StepState,
    ]),
  ) as Record<IntakeStepId, StepState>;

  let outline: IntakeEventOf<"intake.propose_outline"> | undefined;
  let courseCreated: IntakeEventOf<"intake.course_created"> | undefined;
  let actionable: ActionableEvent | undefined;
  const answered = new Set<string>();

  for (const event of events) {
    switch (event.type) {
      case "intake.set_progress":
        for (const section of event.sections) {
          if (section.id in stepStates) {
            stepStates[section.id as IntakeStepId] = {
              status: section.status,
              summary: section.summary,
            };
          }
        }
        break;
      case "intake.propose_outline":
        outline = event;
        break;
      case "intake.course_created":
        courseCreated = event;
        break;
      case "intake.present_choices":
      case "intake.assess_knowledge":
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

  if (courseCreated) {
    for (const step of STEPS) {
      if (stepStates[step.id].status !== "done") {
        stepStates[step.id] = {
          ...stepStates[step.id],
          status: "done",
        };
      }
    }
  }

  const activeStepId: IntakeStepId =
    actionable?.sectionId ??
    STEPS.find((step) => stepStates[step.id].status === "active")?.id ??
    STEPS.find((step) => stepStates[step.id].status !== "done")?.id ??
    "created";

  return { stepStates, actionable, outline, courseCreated, activeStepId };
}

function StepCard({
  label,
  state,
  expanded,
  children,
}: {
  label: string;
  state: StepState;
  expanded: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors",
        state.status === "pending" && "bg-card/50",
        expanded && "border-primary/30",
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        {state.status === "done" ? (
          <CheckCircleIcon
            weight="fill"
            className="size-4.5 shrink-0 text-primary"
          />
        ) : state.status === "active" ? (
          <CircleNotchIcon className="size-4.5 shrink-0 animate-spin text-primary" />
        ) : (
          <CircleIcon className="size-4.5 shrink-0 text-muted-foreground/40" />
        )}
        <p
          className={cn(
            "text-sm font-medium",
            state.status === "pending" && "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {state.status === "done" && state.summary ? (
          <p className="ml-auto min-w-0 truncate text-right text-xs text-muted-foreground">
            {state.summary}
          </p>
        ) : null}
      </div>
      {expanded && children ? <div className="space-y-3">{children}</div> : null}
    </section>
  );
}

function ActionableContent({
  event,
  onRespond,
}: {
  event: ActionableEvent;
  onRespond: (response: PanelResponse) => void;
}) {
  if (event.type === "intake.present_choices") {
    return <ChoicesPrompt event={event} onRespond={onRespond} />;
  }
  if (event.type === "intake.assess_knowledge") {
    return <KnowledgeGrid event={event} onRespond={onRespond} />;
  }
  return <ConfirmationPrompt event={event} onRespond={onRespond} />;
}

function ChoicesPrompt({
  event,
  onRespond,
}: {
  event: IntakeEventOf<"intake.present_choices">;
  onRespond: (response: PanelResponse) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function submit(ids: string[]) {
    const labels = ids.map(
      (id) => event.choices.find((choice) => choice.id === id)?.label ?? id,
    );
    onRespond({
      refEventId: event.id,
      value: { kind: "choices", selected: ids, labels },
      displayText: labels.join(", "),
    });
  }

  return (
    <div className="px-4 pb-4">
      <p className="text-sm">{event.prompt}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {event.choices.map((choice) => {
          const isSelected = selected.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              title={choice.description}
              onClick={() => {
                if (!event.multiSelect) {
                  submit([choice.id]);
                  return;
                }
                setSelected((current) =>
                  isSelected
                    ? current.filter((id) => id !== choice.id)
                    : [...current, choice.id],
                );
              }}
              className={cn(
                "rounded-full border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent",
                isSelected &&
                  "border-primary bg-primary/10 text-foreground hover:border-primary",
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      {event.multiSelect ? (
        <Button
          size="sm"
          className="mt-3"
          disabled={selected.length === 0}
          onClick={() => submit(selected)}
        >
          Continue
          <ArrowRightIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

const KNOWLEDGE_LEVELS: { id: KnowledgeLevel; label: string }[] = [
  { id: "comfortable", label: "Comfortable" },
  { id: "somewhat", label: "Somewhat" },
  { id: "new", label: "New to me" },
];

function KnowledgeGrid({
  event,
  onRespond,
}: {
  event: IntakeEventOf<"intake.assess_knowledge">;
  onRespond: (response: PanelResponse) => void;
}) {
  const [ratings, setRatings] = useState<Record<string, KnowledgeLevel>>({});
  const complete = event.topics.every((topic) => ratings[topic.id]);

  function submit() {
    const labels = event.topics.map(
      (topic) =>
        `${topic.label} — ${
          KNOWLEDGE_LEVELS.find((level) => level.id === ratings[topic.id])
            ?.label ?? ratings[topic.id]
        }`,
    );
    onRespond({
      refEventId: event.id,
      value: { kind: "knowledge", ratings, labels },
      displayText: labels.join("; "),
    });
  }

  return (
    <div className="px-4 pb-4">
      <p className="text-sm">{event.prompt}</p>
      <div className="mt-2.5 space-y-2">
        {event.topics.map((topic) => (
          <div
            key={topic.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
          >
            <span className="min-w-0 text-sm" title={topic.description}>
              {topic.label}
            </span>
            <span className="flex gap-1">
              {KNOWLEDGE_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  onClick={() =>
                    setRatings((current) => ({
                      ...current,
                      [topic.id]: level.id,
                    }))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary/40",
                    ratings[topic.id] === level.id
                      ? "border-primary bg-primary/10 font-medium"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {level.label}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-3" disabled={!complete} onClick={submit}>
        Continue
        <ArrowRightIcon className="size-4" />
      </Button>
    </div>
  );
}

function ConfirmationPrompt({
  event,
  onRespond,
}: {
  event: IntakeEventOf<"intake.request_confirmation">;
  onRespond: (response: PanelResponse) => void;
}) {
  const confirmLabel = event.confirmLabel ?? "Looks good";
  const rejectLabel = event.rejectLabel ?? "I have feedback";

  return (
    <div className="flex items-center gap-2 px-4 pb-4">
      <Button
        size="sm"
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
  );
}

function OutlineCard({
  outline,
}: {
  outline: IntakeEventOf<"intake.propose_outline">;
}) {
  return (
    <div className="px-4">
      <div className="rounded-lg border bg-background p-3.5">
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
                    className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5"
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
    </div>
  );
}

function CourseCreatedCard({
  event,
}: {
  event: IntakeEventOf<"intake.course_created">;
}) {
  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg border border-primary/40 bg-background p-5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <BooksIcon weight="fill" className="size-5" />
        </div>
        <p className="mt-3 font-heading text-base font-semibold tracking-tight">
          {event.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {event.moduleCount} module{event.moduleCount === 1 ? "" : "s"} ·{" "}
          {event.lessonCount} lesson{event.lessonCount === 1 ? "" : "s"} —
          taking you there...
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
    </div>
  );
}
