// Shared types + error helper for the occupancy service layer.

// Thrown by services to signal an HTTP-mappable failure. API routes catch this and
// translate `status`/`message` into a NextResponse; anything else → 500.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

// Map a thrown value to { status, error } for an API response.
export function toErrorResponse(e: unknown): { status: number; error: string } {
  if (e instanceof HttpError) return { status: e.status, error: e.message };
  console.error("occupancy service error:", e);
  return { status: 500, error: "Internal error" };
}
