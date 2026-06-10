import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

const namespacedIdSchema = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$`),
      `Expected an opaque ${prefix}_ identifier`,
    );

const strictObject = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict();

export const TimestampSchema = z.string().datetime({ offset: true });
export type Timestamp = z.infer<typeof TimestampSchema>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const EventSequenceSchema = z.number().int().nonnegative();
export type EventSequence = z.infer<typeof EventSequenceSchema>;

export const LearnerIdSchema = namespacedIdSchema("learner");
export type LearnerId = z.infer<typeof LearnerIdSchema>;

export const WorkspaceIdSchema = namespacedIdSchema("workspace");
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;

export const CourseIdSchema = namespacedIdSchema("course");
export type CourseId = z.infer<typeof CourseIdSchema>;

export const CourseModuleIdSchema = namespacedIdSchema("module");
export type CourseModuleId = z.infer<typeof CourseModuleIdSchema>;

export const LessonIdSchema = namespacedIdSchema("lesson");
export type LessonId = z.infer<typeof LessonIdSchema>;

export const SessionIdSchema = namespacedIdSchema("session");
export type SessionId = z.infer<typeof SessionIdSchema>;

export const SessionEventIdSchema = namespacedIdSchema("event");
export type SessionEventId = z.infer<typeof SessionEventIdSchema>;

export const TutorRunIdSchema = namespacedIdSchema("run");
export type TutorRunId = z.infer<typeof TutorRunIdSchema>;

export const VoiceSessionIdSchema = namespacedIdSchema("voice");
export type VoiceSessionId = z.infer<typeof VoiceSessionIdSchema>;

export const TranscriptSegmentIdSchema = namespacedIdSchema("segment");
export type TranscriptSegmentId = z.infer<typeof TranscriptSegmentIdSchema>;

export const ContextSourceIdSchema = namespacedIdSchema("context");
export type ContextSourceId = z.infer<typeof ContextSourceIdSchema>;

export const MasteryObservationIdSchema = namespacedIdSchema("mastery");
export type MasteryObservationId = z.infer<typeof MasteryObservationIdSchema>;

export const ActorSchema = z.enum(["learner", "tutor", "system"]);
export type Actor = z.infer<typeof ActorSchema>;

export const LearningLevelSchema = z.enum([
  "introductory",
  "beginner",
  "intermediate",
  "advanced",
]);
export type LearningLevel = z.infer<typeof LearningLevelSchema>;

export const LearnerSchema = strictObject({
  id: LearnerIdSchema,
  displayName: nonEmptyStringSchema.optional(),
  goals: z.array(nonEmptyStringSchema).default([]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
});
export type Learner = z.infer<typeof LearnerSchema>;

export const WorkspaceKindSchema = z.enum(["personal", "organization"]);
export type WorkspaceKind = z.infer<typeof WorkspaceKindSchema>;

export const WorkspaceSchema = strictObject({
  id: WorkspaceIdSchema,
  kind: WorkspaceKindSchema,
  clerkOrganizationId: nonEmptyStringSchema.optional(),
  ownerLearnerId: LearnerIdSchema.optional(),
  name: nonEmptyStringSchema,
  slug: nonEmptyStringSchema.optional(),
  imageUrl: z.string().url().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const CourseSchema = strictObject({
  id: CourseIdSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: nonEmptyStringSchema,
  description: nonEmptyStringSchema.optional(),
  level: LearningLevelSchema.optional(),
  tags: z.array(nonEmptyStringSchema).default([]),
  moduleIds: z.array(CourseModuleIdSchema).default([]),
  lessonIds: z.array(LessonIdSchema).default([]),
  status: z.enum(["draft", "active", "archived"]),
  /** Learner who generated this course (unset for the seeded catalog). */
  createdByLearnerId: LearnerIdSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseModuleSchema = strictObject({
  id: CourseModuleIdSchema,
  courseId: CourseIdSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: nonEmptyStringSchema,
  summary: nonEmptyStringSchema.optional(),
  orderIndex: z.number().int().nonnegative(),
  lessonIds: z.array(LessonIdSchema).default([]),
  status: z.enum(["draft", "ready", "archived"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const LessonSchema = strictObject({
  id: LessonIdSchema,
  courseId: CourseIdSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: nonEmptyStringSchema,
  summary: nonEmptyStringSchema.optional(),
  orderIndex: z.number().int().nonnegative(),
  objectives: z.array(nonEmptyStringSchema).default([]),
  conceptKeys: z.array(nonEmptyStringSchema).default([]),
  estimatedMinutes: z.number().int().positive().optional(),
  status: z.enum(["draft", "ready", "archived"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const SessionStateSchema = strictObject({
  status: z.enum([
    "created",
    "active",
    "paused",
    "completed",
    "cancelled",
    "failed",
  ]),
  enteredAt: TimestampSchema,
  lastEventSequence: EventSequenceSchema,
  reason: nonEmptyStringSchema.optional(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionKindSchema = z.enum(["lesson", "chat", "intake"]);
export type SessionKind = z.infer<typeof SessionKindSchema>;

export const SessionSchema = strictObject({
  id: SessionIdSchema,
  /** What the session is for; decides persona, tools, and completion. */
  kind: SessionKindSchema.optional(),
  learnerId: LearnerIdSchema,
  workspaceId: WorkspaceIdSchema.optional(),
  courseId: CourseIdSchema.optional(),
  lessonId: LessonIdSchema.optional(),
  topic: nonEmptyStringSchema.optional(),
  goal: nonEmptyStringSchema.optional(),
  state: SessionStateSchema,
  contextSourceIds: z.array(ContextSourceIdSchema).default([]),
  startedAt: TimestampSchema.optional(),
  endedAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
});
export type Session = z.infer<typeof SessionSchema>;

const sessionEventBaseSchema = strictObject({
  id: SessionEventIdSchema,
  sessionId: SessionIdSchema,
  sequence: EventSequenceSchema,
  occurredAt: TimestampSchema,
  recordedAt: TimestampSchema,
});

export const SessionEventBaseSchema = sessionEventBaseSchema;
export type SessionEventBase = z.infer<typeof SessionEventBaseSchema>;

/**
 * A session event minus the envelope fields (id, sequence, timestamps),
 * which are assigned by the event store when the draft is appended.
 */
export type SessionEventDraft = SessionEvent extends infer E
  ? E extends SessionEvent
    ? Omit<E, keyof SessionEventBase>
    : never
  : never;

export const TranscriptEventSchema = z.discriminatedUnion("type", [
  sessionEventBaseSchema.extend({
    type: z.literal("transcript.utterance"),
    speaker: ActorSchema,
    modality: z.enum(["text", "speech"]),
    segmentId: TranscriptSegmentIdSchema,
    turnId: nonEmptyStringSchema.optional(),
    text: nonEmptyStringSchema,
    isFinal: z.boolean(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("transcript.correction"),
    targetEventId: SessionEventIdSchema,
    correctedText: nonEmptyStringSchema,
    reason: nonEmptyStringSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("transcript.redaction"),
    targetEventId: SessionEventIdSchema,
    reason: nonEmptyStringSchema,
  }),
]);
export type TranscriptEvent = z.infer<typeof TranscriptEventSchema>;

export const TutorEventSchema = z.discriminatedUnion("type", [
  sessionEventBaseSchema.extend({
    type: z.literal("tutor.turn_started"),
    trigger: z.enum([
      "learner_input",
      "lesson_start",
      "context_update",
      "manual",
    ]),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("tutor.turn_completed"),
    intent: z.enum([
      "explain",
      "question",
      "hint",
      "recap",
      "practice",
      "next_step",
    ]),
    summary: nonEmptyStringSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("tutor.note"),
    intent: z.enum([
      "misconception",
      "encouragement",
      "instructional_strategy",
      "handoff",
    ]),
    text: nonEmptyStringSchema,
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("tutor.teaching_state"),
    conceptFocus: nonEmptyStringSchema.optional(),
    currentQuestion: nonEmptyStringSchema.optional(),
    explanation: nonEmptyStringSchema.optional(),
    tryThis: nonEmptyStringSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("tutor.agent_request"),
    kind: z.enum(["screen_context", "guided_action", "open_resource"]),
    title: nonEmptyStringSchema,
    message: nonEmptyStringSchema,
    scope: nonEmptyStringSchema,
    retention: z.enum(["transient", "local", "durable"]).optional(),
    primaryActionLabel: nonEmptyStringSchema,
  }),
]);
export type TutorEvent = z.infer<typeof TutorEventSchema>;

export const VisualPointSchema = strictObject({
  x: z.number(),
  y: z.number(),
});
export type VisualPoint = z.infer<typeof VisualPointSchema>;

export const VisualStyleSchema = strictObject({
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  strokeWidth: z.number().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
});
export type VisualStyle = z.infer<typeof VisualStyleSchema>;

export const VisualActionSchema = z.discriminatedUnion("type", [
  sessionEventBaseSchema.extend({
    type: z.literal("visual.draw_path"),
    surfaceId: nonEmptyStringSchema,
    points: z.array(VisualPointSchema).min(2),
    style: VisualStyleSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("visual.add_shape"),
    surfaceId: nonEmptyStringSchema,
    shape: z.enum(["line", "arrow", "rectangle", "ellipse"]),
    origin: VisualPointSchema,
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    end: VisualPointSchema.optional(),
    style: VisualStyleSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("visual.add_text"),
    surfaceId: nonEmptyStringSchema,
    at: VisualPointSchema,
    text: nonEmptyStringSchema,
    style: VisualStyleSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("visual.add_diagram"),
    surfaceId: nonEmptyStringSchema,
    format: z.enum(["mermaid", "svg"]),
    /** Mermaid source text or a complete standalone SVG document. */
    source: nonEmptyStringSchema,
    title: nonEmptyStringSchema.optional(),
    at: VisualPointSchema.optional(),
    width: z.number().positive().optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("visual.set_draw_mode"),
    surfaceId: nonEmptyStringSchema,
    /** Whether the learner's drawing controls are enabled. */
    enabled: z.boolean(),
    note: nonEmptyStringSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("visual.clear_surface"),
    surfaceId: nonEmptyStringSchema,
    reason: nonEmptyStringSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("visual.focus"),
    surfaceId: nonEmptyStringSchema,
    target: nonEmptyStringSchema,
    note: nonEmptyStringSchema.optional(),
  }),
]);
export type VisualAction = z.infer<typeof VisualActionSchema>;

export const ContextContentSchema = z.discriminatedUnion("kind", [
  strictObject({
    kind: z.literal("text"),
    text: nonEmptyStringSchema,
  }),
  strictObject({
    kind: z.literal("image"),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    contentRef: nonEmptyStringSchema,
    altText: nonEmptyStringSchema.optional(),
  }),
  strictObject({
    kind: z.literal("screen_snapshot"),
    contentRef: nonEmptyStringSchema,
    description: nonEmptyStringSchema.optional(),
  }),
  strictObject({
    kind: z.literal("external_reference"),
    url: z.string().url(),
    title: nonEmptyStringSchema.optional(),
  }),
]);
export type ContextContent = z.infer<typeof ContextContentSchema>;

export const ContextRetentionSchema = z.enum([
  "transient",
  "local",
  "durable",
]);
export type ContextRetention = z.infer<typeof ContextRetentionSchema>;

export const ContextSourceSchema = strictObject({
  id: ContextSourceIdSchema,
  sessionId: SessionIdSchema.optional(),
  learnerId: LearnerIdSchema,
  workspaceId: WorkspaceIdSchema.optional(),
  /** Course this material is scoped to (course Materials tab uploads). */
  courseId: CourseIdSchema.optional(),
  /** Lesson this material is attached to (lesson attachments). */
  lessonId: LessonIdSchema.optional(),
  sourceType: z.enum([
    "lesson",
    "learner_supplied",
    "screen",
    "uploaded",
    "external",
    "system_note",
  ]),
  label: nonEmptyStringSchema,
  capturedAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
  retention: ContextRetentionSchema,
  content: ContextContentSchema,
  consent: z.enum(["learner_provided", "learner_approved", "not_required"]),
});
export type ContextSource = z.infer<typeof ContextSourceSchema>;

export const MasteryObservationSchema = strictObject({
  id: MasteryObservationIdSchema,
  learnerId: LearnerIdSchema,
  workspaceId: WorkspaceIdSchema.optional(),
  sessionId: SessionIdSchema.optional(),
  courseId: CourseIdSchema.optional(),
  lessonId: LessonIdSchema.optional(),
  conceptKey: nonEmptyStringSchema,
  observedAt: TimestampSchema,
  sourceEventId: SessionEventIdSchema.optional(),
  signal: z.enum([
    "correct_recall",
    "partial_understanding",
    "misconception",
    "asked_for_help",
    "completed_practice",
    "self_report",
  ]),
  level: z
    .enum(["introduced", "practicing", "comfortable", "mastered"])
    .optional(),
  confidence: z.number().min(0).max(1),
  note: nonEmptyStringSchema.optional(),
});
export type MasteryObservation = z.infer<typeof MasteryObservationSchema>;

export const SessionStateChangedEventSchema = sessionEventBaseSchema.extend({
  type: z.literal("session.state_changed"),
  previousState: SessionStateSchema.optional(),
  nextState: SessionStateSchema,
});
export type SessionStateChangedEvent = z.infer<
  typeof SessionStateChangedEventSchema
>;

export const ContextSourceAddedEventSchema = sessionEventBaseSchema.extend({
  type: z.literal("context.source_added"),
  contextSource: ContextSourceSchema,
});
export type ContextSourceAddedEvent = z.infer<
  typeof ContextSourceAddedEventSchema
>;

export const MasteryObservedEventSchema = sessionEventBaseSchema.extend({
  type: z.literal("mastery.observed"),
  observation: MasteryObservationSchema,
});
export type MasteryObservedEvent = z.infer<typeof MasteryObservedEventSchema>;

export const LessonCheckpointReachedEventSchema = sessionEventBaseSchema.extend(
  {
    type: z.literal("lesson.checkpoint_reached"),
    lessonId: LessonIdSchema.optional(),
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
  },
);
export type LessonCheckpointReachedEvent = z.infer<
  typeof LessonCheckpointReachedEventSchema
>;

export const IntakeChoiceSchema = strictObject({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  description: nonEmptyStringSchema.optional(),
});
export type IntakeChoice = z.infer<typeof IntakeChoiceSchema>;

export const IntakeOutlineLessonSchema = strictObject({
  title: nonEmptyStringSchema,
  summary: nonEmptyStringSchema.optional(),
  objectives: z.array(nonEmptyStringSchema).default([]),
  conceptKeys: z.array(nonEmptyStringSchema).default([]),
  estimatedMinutes: z.number().int().positive().optional(),
});
export type IntakeOutlineLesson = z.infer<typeof IntakeOutlineLessonSchema>;

export const IntakeOutlineModuleSchema = strictObject({
  title: nonEmptyStringSchema,
  summary: nonEmptyStringSchema.optional(),
  lessons: z.array(IntakeOutlineLessonSchema).min(1),
});
export type IntakeOutlineModule = z.infer<typeof IntakeOutlineModuleSchema>;

/**
 * Intake (course-creation interview) events: the builder panel is a pure
 * projection over these, exactly like the whiteboard over `visual.*`.
 */
export const IntakeEventSchema = z.discriminatedUnion("type", [
  sessionEventBaseSchema.extend({
    type: z.literal("intake.present_choices"),
    prompt: nonEmptyStringSchema,
    multiSelect: z.boolean().optional(),
    choices: z.array(IntakeChoiceSchema).min(1),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("intake.propose_outline"),
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema.optional(),
    modules: z.array(IntakeOutlineModuleSchema).min(1),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("intake.request_confirmation"),
    prompt: nonEmptyStringSchema,
    confirmLabel: nonEmptyStringSchema.optional(),
    rejectLabel: nonEmptyStringSchema.optional(),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("intake.set_progress"),
    sections: z
      .array(
        strictObject({
          id: nonEmptyStringSchema,
          label: nonEmptyStringSchema,
          status: z.enum(["pending", "active", "done"]),
          summary: nonEmptyStringSchema.optional(),
        }),
      )
      .min(1),
  }),
  sessionEventBaseSchema.extend({
    type: z.literal("intake.course_created"),
    courseId: CourseIdSchema,
    title: nonEmptyStringSchema,
    moduleCount: z.number().int().nonnegative(),
    lessonCount: z.number().int().nonnegative(),
  }),
]);
export type IntakeEvent = z.infer<typeof IntakeEventSchema>;

/**
 * A structured learner response produced by clicking a panel affordance
 * (choice chip, confirm button, outline edit). Flows through the same turn
 * endpoint as typed text; `refEventId` points at the event it answers.
 */
export const UiResponseEventSchema = sessionEventBaseSchema.extend({
  type: z.literal("ui.response"),
  refEventId: SessionEventIdSchema,
  /** JSON payload, shaped by the referenced event (choice ids, boolean, ...). */
  value: JsonValueSchema,
});
export type UiResponseEvent = z.infer<typeof UiResponseEventSchema>;

export const SessionEventSchema = z.discriminatedUnion("type", [
  SessionStateChangedEventSchema,
  ...TranscriptEventSchema.options,
  ...TutorEventSchema.options,
  ...VisualActionSchema.options,
  ...IntakeEventSchema.options,
  UiResponseEventSchema,
  ContextSourceAddedEventSchema,
  MasteryObservedEventSchema,
  LessonCheckpointReachedEventSchema,
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const TutorRunStatusSchema = z.enum([
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type TutorRunStatus = z.infer<typeof TutorRunStatusSchema>;

export const TutorRunPauseSchema = strictObject({
  runId: TutorRunIdSchema,
  kind: z.enum(["screen_context", "guided_action", "open_resource"]),
  summary: nonEmptyStringSchema,
});
export type TutorRunPause = z.infer<typeof TutorRunPauseSchema>;

export const TutorRunSchema = strictObject({
  id: TutorRunIdSchema,
  sessionId: SessionIdSchema,
  status: TutorRunStatusSchema,
  pause: TutorRunPauseSchema.omit({ runId: true }).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
});
export type TutorRun = z.infer<typeof TutorRunSchema>;
