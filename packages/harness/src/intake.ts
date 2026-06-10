import { z } from "zod";
import type { SessionEventDraft } from "@basics/contracts";
import type { BasicsPrismaClient } from "@basics/db";
import { createNamespacedId } from "./types";
import { defineTool, recordMastery, type ToolSessionContext } from "./tools";

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
    "learner type. Use for goals, experience level, focus areas, pace —",
    "any question with a small set of likely answers. The learner can",
    "always type instead.",
  ].join(" "),
  parameters: z.object({
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
      prompt: input.prompt,
      multiSelect: input.multiSelect,
      choices: input.choices,
    },
  ],
  resultText: () =>
    "Choices shown in the panel. The learner will click or type a reply.",
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
    "Update the section checklist in the builder panel (e.g. Goal, Prior",
    "knowledge, Outline, Created). Call as sections start and complete so",
    "the learner can see the interview taking shape.",
  ].join(" "),
  parameters: z.object({
    sections: z
      .array(
        z.object({
          id: z.string().min(1),
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
    { type: "intake.set_progress", sections: input.sections },
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
  perform: performCreateCourse,
});

/** Tools for the intake (course-creation interview) kind. */
export const INTAKE_TOOLS = [
  intakePresentChoices,
  intakeProposeOutline,
  intakeRequestConfirmation,
  intakeSetProgress,
  recordMastery,
  createCourse,
];
