import { NextRequest, NextResponse } from "next/server";
import { transferSchema } from "@/lib/occupancy/validators";
import { transferSpaces } from "@/lib/occupancy/service";
import { requireUser, isResponse, parseBody, handleError, MANAGE_ROLES } from "@/lib/occupancy/route-helpers";

// POST /api/occupancy/transfers — move one or more spaces to another client (bulk via items[]).
export async function POST(req: NextRequest) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const dto = parseBody(transferSchema, await req.json().catch(() => ({})));
    const result = await transferSpaces(dto, u);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
