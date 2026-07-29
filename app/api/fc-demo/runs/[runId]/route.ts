import { isUuid } from "@/lib/validation";
import { FcServiceError, readFcRun } from "@/lib/fc-sandbox/service";
import { NO_STORE_HEADERS } from "@/utils/http-security";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!isUuid(runId) || !bearerToken(request)) {
    return Response.json(
      { error: "Run not found.", code: "RUN_NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  try {
    return Response.json(await readFcRun(runId, bearerToken(request)), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const known =
      error instanceof FcServiceError
        ? error
        : new FcServiceError("Run unavailable.", 503, "RUN_UNAVAILABLE");
    return Response.json(
      { error: known.message, code: known.code },
      { status: known.status, headers: NO_STORE_HEADERS },
    );
  }
}
