import { startFcRun, FcServiceError } from "@/lib/fc-sandbox/service";
import {
  NO_STORE_HEADERS,
  readJsonObjectRequest,
} from "@/utils/http-security";

export const runtime = "nodejs";
export const maxDuration = 120;

function errorResponse(error: unknown) {
  const serviceError =
    error instanceof FcServiceError
      ? error
      : new FcServiceError(
          "The demo could not start safely.",
          503,
          "DEMO_UNAVAILABLE",
        );
  return Response.json(
    { error: serviceError.message, code: serviceError.code },
    {
      status: serviceError.status,
      headers: {
        ...NO_STORE_HEADERS,
        ...(serviceError.retryAfterSeconds
          ? { "Retry-After": String(serviceError.retryAfterSeconds) }
          : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  const parsed = await readJsonObjectRequest(request, 1_024);
  if (!parsed.success) return parsed.response;
  if (
    parsed.data.scenario !== undefined &&
    parsed.data.scenario !== "retail_launch"
  ) {
    return Response.json(
      { error: "Choose the supported retail launch scenario." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    return Response.json(await startFcRun(request), {
      status: 201,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("FC demo create request failed.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(error);
  }
}
