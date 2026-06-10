import { z } from "zod";
import type { SessionEventDraft } from "@basics/contracts";
import type { BasicsPrismaClient } from "@basics/db";
import { createNamespacedId } from "./types";
import { defineTool, recordMastery, type ToolSessionContext } from "./tools";

/** The canonical stepper — fixed; the model never invents sections. */
export const INTAKE_STEPS = [
  { id: "focus", label: "Focus" },
  { id: "prior_knowledge", label: "Prior knowledge" },
  { id: "scope", label: "Scope" },
  { id: "outline", label: "Outline" },
  { id: "created", label: "Created" },
] as const;

const stepIdSchema = z.enum([
  "focus",
  "prior_knowledge",
  "scope",
  "outline",
  "created",
]);

const choiceSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("Stable machine id for this choice, e.g. 'beginner'"),
  label: z.string().min(1).describe("Short learner-facing label"),
  description: z.string().optional(),
});

const outlineLessonSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  objectives: z
    .array(z.string().min(1))
    .default([])
    .describe("What the learner will be able to do after this lesson"),
  conceptKeys: z
    .array(z.string().min(1))
    .default([])
    .describe("Stable snake_case concept identifiers, e.g. 'closure_scope'"),
  estimatedMinutes: z.number().int().positive().optional(),
});

const outlineModuleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  lessons: z.array(outlineLessonSchema).min(1),
});

export const intakePresentChoices = defineTool({
  name: "intake_present_choices",
  description: [
    "Show clickable choices in the builder panel instead of making the",
    "learner type. Used for the focus and scope steps — any question with",
    "a small set of likely answers. The learner can always type instead.",
  ].join(" "),
  parameters: z.object({
    sectionId: stepIdSchema.describe("The stepper section this belongs to"),
    prompt: z.string().min(1).describe("The question the choices answer"),
    multiSelect: z
      .boolean()
      .optional()
      .describe("Allow selecting more than one choice"),
    choices: z.array(choiceSchema).min(2).max(8),
  }),
  toDrafts: (input) => [
    {
      type: "intake.present_choices",
      sectionId: input.sectionId,
      prompt: input.prompt,
      multiSelect: input.multiSelect,
      choices: input.choices,
    },
  ],
  resultText: () =>
    "Choices shown in the panel. The learner will click or type a reply.",
});

export const intakeAssessKnowledge = defineTool({
  name: "intake_assess_knowledge",
  description: [
    "Show a knowledge self-assessment grid in the builder panel: a list of",
    "subtopics the learner rates as comfortable, somewhat familiar, or new.",
    "Use for the prior_knowledge step instead of asking in prose.",
  ].join(" "),
  parameters: z.object({
    prompt: z.string().min(1).describe("Short framing, e.g. 'How comfortable are you with these?'"),
    topics: z
      .array(choiceSchema)
      .min(3)
      .max(6)
      .describe("Subtopics of what they want to learn, with short labels"),
  }),
  toDrafts: (input) => [
    {
      type: "intake.assess_knowledge",
      sectionId: "prior_knowledge",
      prompt: input.prompt,
      topics: input.topics,
    },
  ],
  resultText: () =>
    "Knowledge grid shown in the panel. The learner will rate each topic.",
  // One grid per session: re-presenting it every turn (a common model
  // failure) is blocked structurally.
  gate: (_ctx, events) =>
    events.some((event) => event.type === "intake.assess_knowledge")
      ? "Blocked: the knowledge grid was already shown. Use their ratings or move on; do not present it again."
      : null,
});

export const intakeProposeOutline = defineTool({
  name: "intake_propose_outline",
  description: [
    "Show a draft course outline (modules and lessons) in the builder",
    "panel for the learner to review. Call again with revisions after",
    "feedback. This does not create the course.",
  ].join(" "),
  parameters: z.object({
    title: z.string().min(1).describe("Working course title"),
    description: z.string().optional(),
    modules: z.array(outlineModuleSchema).min(1).max(8),
  }),
  toDrafts: (input) => [
    {
      type: "intake.propose_outline",
      sectionId: "outline",
      title: input.title,
      description: input.description,
      modules: input.modules,
    },
  ],
  resultText: (input) =>
    `Outline "${input.title}" shown in the panel for review.`,
});

export const intakeRequestConfirmation = defineTool({
  name: "intake_request_confirmation",
  description:
    "Show confirm/feedback buttons in the builder panel, e.g. after proposing an outline.",
  parameters: z.object({
    prompt: z.string().min(1),
    confirmLabel: z.string().optional().describe("Default: 'Looks good'"),
    rejectLabel: z.string().optional().describe("Default: 'I have feedback'"),
  }),
  toDrafts: (input) => [
    {
      type: "intake.request_confirmation",
      sectionId: "outline",
      prompt: input.prompt,
      confirmLabel: input.confirmLabel,
      rejectLabel: input.rejectLabel,
    },
  ],
  resultText: () => "Confirmation buttons shown in the panel.",
});

export const intakeSetProgress = defineTool({
  name: "intake_set_progress",
  description: [
    "Update the fixed five-step checklist in the builder panel (focus,",
    "prior_knowledge, scope, outline, created). Call at the start of every",
    "turn with all five sections and their current status.",
  ].join(" "),
  parameters: z.object({
    sections: z
      .array(
        z.object({
          id: stepIdSchema,
          label: z.string().min(1),
          status: z.enum(["pending", "active", "done"]),
          summary: z
            .string()
            .optional()
            .describe("One-line summary of what was decided"),
        }),
      )
      .min(1)
      .max(8),
  }),
  toDrafts: (input) => [
    {
      type: "intake.set_progress",
      // Models often send summary: "" for pending sections; the contract
      // wants the field absent instead.
      sections: input.sections.map(({ summary, ...section }) => ({
        ...section,
        ...(summary?.trim() ? { summary: summary.trim() } : {}),
      })),
    },
  ],
  resultText: () => "Panel progress updated.",
});

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "course"
  );
}

const createCourseParameters = z.object({
  title: z.string().min(1).max(120),
  description: z.string().optional(),
  level: z
    .enum(["introductory", "beginner", "intermediate", "advanced"])
    .optional(),
  tags: z.array(z.string().min(1)).max(8).default([]),
  modules: z.array(outlineModuleSchema).min(1).max(8),
});

type CreateCourseInput = z.output<typeof createCourseParameters>;

/**
 * The intake finale: writes the Course + CourseModules + Lessons the
 * interview converged on, attaches the session's uploaded materials to the
 * course, enrolls the creator, and points the session at the new course.
 */
async function performCreateCourse(
  input: CreateCourseInput,
  ctx: ToolSessionContext,
  db: BasicsPrismaClient,
): Promise<SessionEventDraft[]> {
  const now = new Date();
  const courseId = createNamespacedId("course");
  const slug = `${slugify(input.title)}-${courseId.slice(-6)}`;
  let lessonCount = 0;

  await db.$transaction(async (tx) => {
    await tx.course.create({
      data: {
        id: courseId,
        slug,
        title: input.title,
        description: input.description,
        level: input.level,
        tags: input.tags,
        status: "active",
        createdByLearnerId: ctx.learnerId,
        createdAt: now,
      },
    });

    for (const [moduleIndex, module] of input.modules.entries()) {
      const moduleId = createNamespacedId("module");

      await tx.courseModule.create({
        data: {
          id: moduleId,
          courseId,
          slug: `${slugify(module.title)}-${moduleId.slice(-6)}`,
          title: module.title,
          summary: module.summary,
          orderIndex: moduleIndex,
          status: "ready",
          createdAt: now,
        },
      });

      for (const [lessonIndex, lesson] of module.lessons.entries()) {
        const lessonId = createNamespacedId("lesson");
        lessonCount += 1;

        await tx.lesson.create({
          data: {
            id: lessonId,
            courseId,
            moduleId,
            slug: `${slugify(lesson.title)}-${lessonId.slice(-6)}`,
            title: lesson.title,
            summary: lesson.summary,
            orderIndex: lessonIndex,
            objectives: lesson.objectives,
            conceptKeys: lesson.conceptKeys,
            estimatedMinutes: lesson.estimatedMinutes,
            status: "ready",
            createdAt: now,
          },
        });
      }
    }

    await tx.enrollment.upsert({
      where: {
        learnerId_courseId: { learnerId: ctx.learnerId, courseId },
      },
      create: {
        id: createNamespacedId("enrollment"),
        learnerId: ctx.learnerId,
        courseId,
        status: "active",
        enrolledAt: now,
        createdAt: now,
      },
      update: { status: "active" },
    });

    // Attach the materials uploaded during intake to the new course, and
    // point the intake session at it so later turns see the course.
    const session = await tx.session.findUniqueOrThrow({
      where: { id: ctx.sessionId },
      select: { contextSourceIds: true },
    });

    if (session.contextSourceIds.length > 0) {
      await tx.contextSource.updateMany({
        where: {
          id: { in: session.contextSourceIds },
          learnerId: ctx.learnerId,
        },
        data: { courseId },
      });
    }

    await tx.session.update({
      where: { id: ctx.sessionId },
      data: { courseId, topic: input.title },
    });
  });

  return [
    {
      type: "intake.course_created",
      courseId,
      title: input.title,
      moduleCount: input.modules.length,
      lessonCount,
    },
  ];
}

export const createCourse = defineTool({
  name: "create_course",
  description: [
    "Create the real course from the agreed outline. Only call after the",
    "learner has confirmed the outline. This writes the course, modules,",
    "and lessons, attaches uploaded materials, and enrolls the learner.",
  ].join(" "),
  parameters: createCourseParameters,
  toDrafts: () => [],
  resultText: (input) =>
    `Course "${input.title}" created. Tell the learner it is ready.`,
  // Structural confirmation gate: the persisted event log must show a
  // request_confirmation that the learner answered (panel click or typed
  // reply) in a LATER turn. Proposing and creating in the same turn is
  // impossible by construction, whatever the prompt says.
  gate: (_ctx, events) => {
    let pendingConfirmationId: string | null = null;
    let answered = false;

    for (const event of events) {
      if (event.type === "intake.request_confirmation") {
        pendingConfirmationId = event.id;
        answered = false;
      } else if (!pendingConfirmationId || answered) {
        continue;
      } else if (event.type === "ui.response") {
        if (event.refEventId === pendingConfirmationId) {
          const value = event.value as { approved?: boolean } | null;
          answered = value?.approved !== false;
        }
      } else if (
        event.type === "transcript.utterance" &&
        event.speaker === "learner" &&
        event.isFinal
      ) {
        // A typed reply after the confirmation request counts as an answer;
        // whether it was a yes is the model's call.
        answered = true;
      }
    }

    return answered
      ? null
      : [
          "Blocked: the learner has not confirmed the outline yet. Call",
          "intake_propose_outline and intake_request_confirmation, end the",
          "turn, and wait for their reply before calling create_course.",
        ].join(" ");
  },
  perform: performCreateCourse,
});

/** Tools for the intake (course-creation interview) kind. */
export const INTAKE_TOOLS = [
  intakePresentChoices,
  intakeAssessKnowledge,
  intakeProposeOutline,
  intakeRequestConfirmation,
  intakeSetProgress,
  recordMastery,
  createCourse,
];
