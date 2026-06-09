import {
  CourseModuleSchema,
  CourseSchema,
  LessonSchema,
  type Course,
  type CourseModule,
  type Lesson,
} from "@basics/contracts";
import { z } from "zod";

const seedCreatedAt = "2026-01-01T00:00:00.000Z";

export const SEED_COURSES: Course[] = z.array(CourseSchema).parse([
  {
    id: "course_visual-js",
    slug: "visual-javascript-fundamentals",
    title: "Visual JavaScript Fundamentals",
    description:
      "Learn core JavaScript ideas through diagrams, examples, and spoken reasoning.",
    level: "beginner",
    tags: ["javascript", "programming", "visual-models"],
    moduleIds: ["module_visual-js-runtime"],
    lessonIds: [
      "lesson_visual-js-values",
      "lesson_visual-js-event-loop",
      "lesson_visual-js-dom-tree",
    ],
    status: "active",
    createdAt: seedCreatedAt,
  },
  {
    id: "course_generative-graphics",
    slug: "generative-graphics-basics",
    title: "Generative Graphics Basics",
    description:
      "Practice coordinate systems, paths, color, and composition with a persistent whiteboard.",
    level: "introductory",
    tags: ["creative-coding", "graphics", "visual-learning"],
    moduleIds: ["module_generative-graphics-canvas"],
    lessonIds: [
      "lesson_generative-graphics-coordinates",
      "lesson_generative-graphics-shapes",
      "lesson_generative-graphics-color",
    ],
    status: "active",
    createdAt: seedCreatedAt,
  },
  {
    id: "course_debugging-mental-models",
    slug: "debugging-with-mental-models",
    title: "Debugging With Mental Models",
    description:
      "Use traces, state diagrams, and hypotheses to reason through broken programs.",
    level: "intermediate",
    tags: ["debugging", "systems-thinking", "software-engineering"],
    moduleIds: ["module_debugging-feedback-loop"],
    lessonIds: [
      "lesson_debugging-reproduce",
      "lesson_debugging-state",
      "lesson_debugging-hypotheses",
    ],
    status: "active",
    createdAt: seedCreatedAt,
  },
]);

export const SEED_COURSE_MODULES: CourseModule[] = z
  .array(CourseModuleSchema)
  .parse([
    {
      id: "module_visual-js-runtime",
      courseId: "course_visual-js",
      slug: "runtime-mental-models",
      title: "Runtime Mental Models",
      summary:
        "Build durable pictures for values, queues, and document structure.",
      orderIndex: 0,
      lessonIds: [
        "lesson_visual-js-values",
        "lesson_visual-js-event-loop",
        "lesson_visual-js-dom-tree",
      ],
      status: "ready",
      createdAt: seedCreatedAt,
    },
    {
      id: "module_generative-graphics-canvas",
      courseId: "course_generative-graphics",
      slug: "canvas-building-blocks",
      title: "Canvas Building Blocks",
      summary:
        "Use coordinates, paths, and color to make generated graphics readable.",
      orderIndex: 0,
      lessonIds: [
        "lesson_generative-graphics-coordinates",
        "lesson_generative-graphics-shapes",
        "lesson_generative-graphics-color",
      ],
      status: "ready",
      createdAt: seedCreatedAt,
    },
    {
      id: "module_debugging-feedback-loop",
      courseId: "course_debugging-mental-models",
      slug: "debugging-feedback-loop",
      title: "Debugging Feedback Loop",
      summary:
        "Move from vague failure to reproducible evidence and focused hypotheses.",
      orderIndex: 0,
      lessonIds: [
        "lesson_debugging-reproduce",
        "lesson_debugging-state",
        "lesson_debugging-hypotheses",
      ],
      status: "ready",
      createdAt: seedCreatedAt,
    },
  ]);

export const SEED_LESSONS: Lesson[] = z.array(LessonSchema).parse([
  {
    id: "lesson_visual-js-values",
    courseId: "course_visual-js",
    slug: "values-variables-and-references",
    title: "Values, Variables, And References",
    summary:
      "Build a mental model for labels, values, references, and mutation.",
    orderIndex: 0,
    objectives: [
      "Explain the difference between a variable name and a value",
      "Trace a simple reassignment step by step",
      "Draw a reference relationship for arrays and objects",
    ],
    conceptKeys: ["variables", "references", "mutation"],
    estimatedMinutes: 18,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_visual-js-event-loop",
    courseId: "course_visual-js",
    slug: "event-loop-as-a-queue",
    title: "The Event Loop As A Queue",
    summary:
      "Use queue diagrams to reason about callbacks, promises, and rendering turns.",
    orderIndex: 1,
    objectives: [
      "Describe call stack and task queue responsibilities",
      "Predict output order for async examples",
      "Use a timeline diagram to debug async behavior",
    ],
    conceptKeys: ["event-loop", "promises", "task-queue"],
    estimatedMinutes: 24,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_visual-js-dom-tree",
    courseId: "course_visual-js",
    slug: "dom-changes-as-a-tree",
    title: "DOM Changes As A Tree",
    summary:
      "Understand document structure and updates by drawing tree transformations.",
    orderIndex: 2,
    objectives: [
      "Map HTML markup to a DOM tree",
      "Explain how a selector finds nodes",
      "Predict the effect of a DOM update",
    ],
    conceptKeys: ["dom", "tree-structure", "selectors"],
    estimatedMinutes: 22,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_generative-graphics-coordinates",
    courseId: "course_generative-graphics",
    slug: "coordinate-systems",
    title: "Coordinate Systems",
    summary:
      "Use axes, origins, and transforms to place visual elements intentionally.",
    orderIndex: 0,
    objectives: [
      "Identify origin and axis direction in a canvas",
      "Place points using x and y coordinates",
      "Reason about translation as a visual movement",
    ],
    conceptKeys: ["coordinates", "origin", "translation"],
    estimatedMinutes: 16,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_generative-graphics-shapes",
    courseId: "course_generative-graphics",
    slug: "shapes-and-paths",
    title: "Shapes And Paths",
    summary:
      "Represent images as combinations of primitives, paths, and repeated structure.",
    orderIndex: 1,
    objectives: [
      "Break an image into simple primitives",
      "Describe a path as an ordered set of drawing commands",
      "Use repetition to create visual rhythm",
    ],
    conceptKeys: ["shape-primitives", "paths", "repetition"],
    estimatedMinutes: 20,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_generative-graphics-color",
    courseId: "course_generative-graphics",
    slug: "color-and-contrast",
    title: "Color And Contrast",
    summary:
      "Use color choices to direct attention and make generated graphics legible.",
    orderIndex: 2,
    objectives: [
      "Explain contrast in visual hierarchy",
      "Choose colors for figure and ground",
      "Adjust opacity without losing readability",
    ],
    conceptKeys: ["color", "contrast", "opacity"],
    estimatedMinutes: 18,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_debugging-reproduce",
    courseId: "course_debugging-mental-models",
    slug: "make-the-bug-reproducible",
    title: "Make The Bug Reproducible",
    summary:
      "Turn a vague failure into a repeatable observation before changing code.",
    orderIndex: 0,
    objectives: [
      "State expected and actual behavior separately",
      "Create a minimal reproduction path",
      "Record the first known failing state",
    ],
    conceptKeys: ["reproduction", "expected-actual", "observability"],
    estimatedMinutes: 20,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_debugging-state",
    courseId: "course_debugging-mental-models",
    slug: "draw-the-state",
    title: "Draw The State",
    summary:
      "Use state sketches and traces to see what the program currently believes.",
    orderIndex: 1,
    objectives: [
      "Draw relevant state before and after a failing step",
      "Find where state diverges from expectation",
      "Use logs as evidence rather than guesses",
    ],
    conceptKeys: ["state", "trace", "evidence"],
    estimatedMinutes: 24,
    status: "ready",
    createdAt: seedCreatedAt,
  },
  {
    id: "lesson_debugging-hypotheses",
    courseId: "course_debugging-mental-models",
    slug: "test-one-hypothesis",
    title: "Test One Hypothesis",
    summary:
      "Make small, falsifiable debugging moves instead of rewriting around uncertainty.",
    orderIndex: 2,
    objectives: [
      "Write a falsifiable debugging hypothesis",
      "Choose the smallest check that can disprove it",
      "Separate confirmed facts from open questions",
    ],
    conceptKeys: ["hypothesis", "falsifiability", "debugging-loop"],
    estimatedMinutes: 22,
    status: "ready",
    createdAt: seedCreatedAt,
  },
]);
