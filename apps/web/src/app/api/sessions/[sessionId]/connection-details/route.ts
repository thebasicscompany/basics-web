import { NextResponse } from "next/server";
import {
  RoomAgentDispatch,
  RoomConfiguration,
} from "@livekit/protocol";
import { AccessToken, type VideoGrant } from "livekit-server-sdk";
import { getLearnerContext, getLearnerPreferences } from "@/lib/learner";
import { getOwnedSession } from "@/lib/session-store";

export const revalidate = 0;

const AGENT_NAME = "basics-tutor";

/**
 * Standard LiveKit token endpoint (TokenSource.endpoint format) scoped to a
 * lesson session: the room is the session id and a tutor agent is dispatched
 * with the session id in its job metadata.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit is not configured (LIVEKIT_URL/API_KEY/API_SECRET)" },
      { status: 500 },
    );
  }

  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getOwnedSession(context, sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const preferences = await getLearnerPreferences(context.learnerId);

  const token = new AccessToken(apiKey, apiSecret, {
    identity: context.learnerId,
    name: context.displayName ?? "Learner",
    ttl: "15m",
  });

  const grant: VideoGrant = {
    room: sessionId,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  token.addGrant(grant);

  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: AGENT_NAME,
        metadata: JSON.stringify({
          sessionId,
          voiceMode: preferences.voiceMode,
        }),
      }),
    ],
  });

  return NextResponse.json(
    {
      serverUrl: livekitUrl,
      participantToken: await token.toJwt(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
