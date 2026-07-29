import { FcServiceError, prepareFcRun } from "@/lib/fc-sandbox/service";
import { isUuid, stringValue } from "@/lib/validation";
import {
  NO_STORE_HEADERS,
  readJsonObjectRequest,
} from "@/utils/http-security";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const parsed = await readJsonObjectRequest(request, 1_024);
  if (!parsed.success) return parsed.response;
  const accessToken = stringValue(parsed.data.accessToken, 128);
  if (!isUuid(runId) || !accessToken) {
    return Response.json(
      { error: "Run not found.", code: "RUN_NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  try {
    return Response.json(await prepareFcRun(runId, accessToken), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const known =
      error instanceof FcServiceError
        ? error
        : new FcServiceError(
            "The sandbox could not be prepared.",
            503,
            "PREPARATION_UNAVAILABLE",
          );
    return Response.json(
      { error: known.message, code: known.code },
      { status: known.status, headers: NO_STORE_HEADERS },
    );
  }
}
