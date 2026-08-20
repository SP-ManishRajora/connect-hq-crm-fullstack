import { NextRequest, NextResponse } from "next/server";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
} from "@/lib/housekeeping/route-helpers";
import { syncSchema, syncOneVisit, type SyncItemResult } from "@/lib/housekeeping/sync";

// POST /api/housekeeping/sync — drain the Android app's offline queue.
//
// Returns 200 with a per-item verdict even when some items fail. A blanket 4xx
// would tell the app "retry everything", which for a partially-accepted batch
// means duplicating the accepted half; `clientVisitId` makes that safe, but
// silently correct is worse than explicitly correct here. The app clears exactly
// the ids the server reports as SYNCED or DUPLICATE, and keeps the rest.
//
// See lib/housekeeping/sync.ts for why offline visits are a separate, weaker
// class of evidence rather than a relaxation of the online rules.
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(syncSchema, await req.json());

    // Sequential, not parallel: `sequence` is derived from the round's current
    // maximum, and concurrent inserts into the same round would collide on it.
    const results: SyncItemResult[] = [];
    for (const item of body.visits) {
      results.push(await syncOneVisit(u, item));
    }

    return NextResponse.json({
      results,
      synced: results.filter((r) => r.status === "SYNCED").length,
      duplicates: results.filter((r) => r.status === "DUPLICATE").length,
      rejected: results.filter((r) => r.status === "REJECTED").length,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
