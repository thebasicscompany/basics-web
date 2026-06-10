-- AlterTable
ALTER TABLE "context_sources" ADD COLUMN     "course_id" TEXT,
ADD COLUMN     "lesson_id" TEXT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "created_by_learner_id" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'chat';

-- CreateIndex
CREATE INDEX "context_sources_course_id_idx" ON "context_sources"("course_id");

-- CreateIndex
CREATE INDEX "context_sources_lesson_id_idx" ON "context_sources"("lesson_id");

-- CreateIndex
CREATE INDEX "courses_created_by_learner_id_idx" ON "courses"("created_by_learner_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_learner_id_fkey" FOREIGN KEY ("created_by_learner_id") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: sessions with a lesson are lesson sessions, the rest are chats.
UPDATE "sessions" SET "kind" = 'lesson' WHERE "lesson_id" IS NOT NULL;

-- Backfill: lift the courseId JSON hack out of context_sources.content into
-- the real column (only for courses that still exist, to satisfy the FK).
UPDATE "context_sources" cs
SET "course_id" = cs."content" ->> 'courseId'
WHERE cs."content" ->> 'courseId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM "courses" c WHERE c."id" = cs."content" ->> 'courseId');
