-- CreateTable
CREATE TABLE "learners" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT,
    "display_name" TEXT,
    "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clerk_organization_id" TEXT,
    "owner_learner_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_modules" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "order_index" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "module_id" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "order_index" INTEGER NOT NULL,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "concept_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_minutes" INTEGER,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "course_id" TEXT,
    "module_id" TEXT,
    "lesson_id" TEXT,
    "topic" TEXT,
    "goal" TEXT,
    "state" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "context_source_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_runs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pause" JSONB,
    "state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_projections" (
    "event_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "segment_id" TEXT,
    "speaker" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_final" BOOLEAN NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcript_projections_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "visual_state_projections" (
    "event_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "surface_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_state_projections_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "context_sources" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "session_id" TEXT,
    "learner_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "source_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "retention" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "consent" TEXT NOT NULL,

    CONSTRAINT "context_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_observations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "learner_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "session_id" TEXT,
    "course_id" TEXT,
    "lesson_id" TEXT,
    "concept_key" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "source_event_id" TEXT,
    "signal" TEXT NOT NULL,
    "level" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "mastery_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_checkpoint_records" (
    "event_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "lesson_id" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_checkpoint_records_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "summaries" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source_event_sequence_min" INTEGER,
    "source_event_sequence_max" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learners_clerk_user_id_key" ON "learners"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_clerk_organization_id_key" ON "workspaces"("clerk_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_owner_learner_id_key" ON "workspaces"("owner_learner_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "course_modules_course_id_order_index_idx" ON "course_modules"("course_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_course_id_slug_key" ON "course_modules"("course_id", "slug");

-- CreateIndex
CREATE INDEX "lessons_course_id_order_index_idx" ON "lessons"("course_id", "order_index");

-- CreateIndex
CREATE INDEX "lessons_module_id_order_index_idx" ON "lessons"("module_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_course_id_slug_key" ON "lessons"("course_id", "slug");

-- CreateIndex
CREATE INDEX "sessions_learner_id_updated_at_idx" ON "sessions"("learner_id", "updated_at");

-- CreateIndex
CREATE INDEX "sessions_workspace_id_learner_id_updated_at_idx" ON "sessions"("workspace_id", "learner_id", "updated_at");

-- CreateIndex
CREATE INDEX "sessions_course_id_idx" ON "sessions"("course_id");

-- CreateIndex
CREATE INDEX "sessions_lesson_id_idx" ON "sessions"("lesson_id");

-- CreateIndex
CREATE INDEX "session_events_session_id_type_idx" ON "session_events"("session_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "session_events_session_id_sequence_key" ON "session_events"("session_id", "sequence");

-- CreateIndex
CREATE INDEX "tutor_runs_session_id_status_idx" ON "tutor_runs"("session_id", "status");

-- CreateIndex
CREATE INDEX "transcript_projections_session_id_sequence_idx" ON "transcript_projections"("session_id", "sequence");

-- CreateIndex
CREATE INDEX "transcript_projections_segment_id_idx" ON "transcript_projections"("segment_id");

-- CreateIndex
CREATE INDEX "visual_state_projections_session_id_surface_id_sequence_idx" ON "visual_state_projections"("session_id", "surface_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "context_sources_event_id_key" ON "context_sources"("event_id");

-- CreateIndex
CREATE INDEX "context_sources_learner_id_created_at_idx" ON "context_sources"("learner_id", "created_at");

-- CreateIndex
CREATE INDEX "context_sources_workspace_id_created_at_idx" ON "context_sources"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "context_sources_session_id_idx" ON "context_sources"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_observations_event_id_key" ON "mastery_observations"("event_id");

-- CreateIndex
CREATE INDEX "mastery_observations_learner_id_concept_key_idx" ON "mastery_observations"("learner_id", "concept_key");

-- CreateIndex
CREATE INDEX "mastery_observations_workspace_id_concept_key_idx" ON "mastery_observations"("workspace_id", "concept_key");

-- CreateIndex
CREATE INDEX "mastery_observations_session_id_idx" ON "mastery_observations"("session_id");

-- CreateIndex
CREATE INDEX "lesson_checkpoint_records_learner_id_occurred_at_idx" ON "lesson_checkpoint_records"("learner_id", "occurred_at");

-- CreateIndex
CREATE INDEX "lesson_checkpoint_records_workspace_id_occurred_at_idx" ON "lesson_checkpoint_records"("workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "lesson_checkpoint_records_session_id_idx" ON "lesson_checkpoint_records"("session_id");

-- CreateIndex
CREATE INDEX "summaries_session_id_kind_idx" ON "summaries"("session_id", "kind");

-- CreateIndex
CREATE INDEX "summaries_workspace_id_kind_idx" ON "summaries"("workspace_id", "kind");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_learner_id_fkey" FOREIGN KEY ("owner_learner_id") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_runs" ADD CONSTRAINT "tutor_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_projections" ADD CONSTRAINT "transcript_projections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "session_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_projections" ADD CONSTRAINT "transcript_projections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_state_projections" ADD CONSTRAINT "visual_state_projections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "session_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_state_projections" ADD CONSTRAINT "visual_state_projections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "session_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_observations" ADD CONSTRAINT "mastery_observations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "session_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_observations" ADD CONSTRAINT "mastery_observations_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_observations" ADD CONSTRAINT "mastery_observations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_observations" ADD CONSTRAINT "mastery_observations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_observations" ADD CONSTRAINT "mastery_observations_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_checkpoint_records" ADD CONSTRAINT "lesson_checkpoint_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "session_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_checkpoint_records" ADD CONSTRAINT "lesson_checkpoint_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_checkpoint_records" ADD CONSTRAINT "lesson_checkpoint_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_checkpoint_records" ADD CONSTRAINT "lesson_checkpoint_records_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
