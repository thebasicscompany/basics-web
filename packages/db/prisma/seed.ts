import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { createPrismaClient } = await import("../src/client.js");
const { SEED_COURSE_MODULES, SEED_COURSES, SEED_LESSONS } = await import(
  "../src/seed-data.js"
);

const prisma = createPrismaClient();

const toDate = (value: string) => new Date(value);

async function main() {
  for (const course of SEED_COURSES) {
    await prisma.course.upsert({
      where: { id: course.id },
      create: {
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        level: course.level,
        tags: course.tags,
        status: course.status,
        createdAt: toDate(course.createdAt),
      },
      update: {
        slug: course.slug,
        title: course.title,
        description: course.description,
        level: course.level,
        tags: course.tags,
        status: course.status,
      },
    });
  }

  for (const courseModule of SEED_COURSE_MODULES) {
    await prisma.courseModule.upsert({
      where: { id: courseModule.id },
      create: {
        id: courseModule.id,
        courseId: courseModule.courseId,
        slug: courseModule.slug,
        title: courseModule.title,
        summary: courseModule.summary,
        orderIndex: courseModule.orderIndex,
        status: courseModule.status,
        createdAt: toDate(courseModule.createdAt),
      },
      update: {
        courseId: courseModule.courseId,
        slug: courseModule.slug,
        title: courseModule.title,
        summary: courseModule.summary,
        orderIndex: courseModule.orderIndex,
        status: courseModule.status,
      },
    });
  }

  for (const lesson of SEED_LESSONS) {
    const courseModule = SEED_COURSE_MODULES.find((entry) =>
      entry.lessonIds.includes(lesson.id),
    );

    await prisma.lesson.upsert({
      where: { id: lesson.id },
      create: {
        id: lesson.id,
        courseId: lesson.courseId,
        moduleId: courseModule?.id,
        slug: lesson.slug,
        title: lesson.title,
        summary: lesson.summary,
        orderIndex: lesson.orderIndex,
        objectives: lesson.objectives,
        conceptKeys: lesson.conceptKeys,
        estimatedMinutes: lesson.estimatedMinutes,
        status: lesson.status,
        createdAt: toDate(lesson.createdAt),
      },
      update: {
        courseId: lesson.courseId,
        moduleId: courseModule?.id,
        slug: lesson.slug,
        title: lesson.title,
        summary: lesson.summary,
        orderIndex: lesson.orderIndex,
        objectives: lesson.objectives,
        conceptKeys: lesson.conceptKeys,
        estimatedMinutes: lesson.estimatedMinutes,
        status: lesson.status,
      },
    });
  }

  console.log(
    `Seeded ${SEED_COURSES.length} courses, ${SEED_COURSE_MODULES.length} modules, and ${SEED_LESSONS.length} lessons.`,
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
