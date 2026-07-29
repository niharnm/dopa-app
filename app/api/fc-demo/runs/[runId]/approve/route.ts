import { approveFcRun, FcServiceError } from "@/lib/fc-sandbox/service";
import { isUuid, stringValue } from "@/lib/validation";
import {
  NO_STORE_HEADERS,
  readJsonObjectRequest,
} from "@/utils/http-security";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const parsed = await readJsonObjectRequest(request, 2_048);
  if (!parsed.success) return parsed.response;
  const accessToken = stringValue(parsed.data.accessToken, 128);
  const approvalNonce = stringValue(parsed.data.approvalNonce, 128);
  if (!isUuid(runId) || !accessToken || !approvalNonce) {
    return Response.json(
      { error: "This approval request is invalid.", code: "INVALID_APPROVAL" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  try {
    return Response.json(
      await approveFcRun(runId, accessToken, approvalNonce),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const known =
      error instanceof FcServiceError
        ? error
        : new FcServiceError(
            "The approval could not be completed.",
            503,
            "APPROVAL_UNAVAILABLE",
          );
    return Response.json(
      { error: known.message, code: known.code },
      { status: known.status, headers: NO_STORE_HEADERS },
    );
  }
}
