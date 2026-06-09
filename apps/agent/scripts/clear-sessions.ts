/**
 * Dev utility: wipe all tutor session data (events, projections, sessions)
 * so lessons start fresh. Run with: pnpm --filter @basics/agent clear-sessions
 */
import { createPrismaClient } from "@basics/db";

async function main() {
  const db = createPrismaClient();

  const events = await db.sessionEvent.deleteMany({});
  await db.tutorRun.deleteMany({});
  await db.transcriptProjection.deleteMany({});
  await db.visualStateProjection.deleteMany({});
  await db.masteryObservation.deleteMany({});
  await db.lessonCheckpointRecord.deleteMany({});
  await db.summary.deleteMany({});
  const sessions = await db.session.deleteMany({});

  console.log(
    `Cleared ${sessions.count} sessions and ${events.count} events.`,
  );
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
