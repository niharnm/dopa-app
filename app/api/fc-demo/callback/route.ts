import {
  appendProviderTrace,
  getFcCallbackSecret,
} from "@/lib/fc-sandbox/service";
import { verifyWebhookSignature } from "@/lib/fc-sandbox/security";
import { isJsonObject, isUuid, stringValue } from "@/lib/validation";
import {
  NO_STORE_HEADERS,
  readBoundedRequestText,
} from "@/utils/http-security";

export const runtime = "nodejs";

function safeMetadata(value: unknown) {
  if (!isJsonObject(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    if (
      key.length <= 50 &&
      (item === null ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean")
    ) {
      result[key] = typeof item === "string" ? item.slice(0, 200) : item;
    }
  }
  return result;
}

export async function POST(request: Request) {
  const secret = getFcCallbackSecret();
  if (!secret) {
    return Response.json(
      { error: "Callback verification is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    return Response.json(
      { error: "Send a JSON callback." },
      { status: 415, headers: NO_STORE_HEADERS },
    );
  }
  const timestamp = request.headers.get("x-dopa-timestamp") ?? "";
  const timestampSeconds = Number(timestamp);
  if (
    !/^\d{10}$/.test(timestamp) ||
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Date.now() / 1_000 - timestampSeconds) > 300
  ) {
    return Response.json(
      { error: "Expired callback request." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  const rawResult = await readBoundedRequestText(request, 16_000);
  if (!rawResult.success) return rawResult.response;
  const rawBody = rawResult.data;
  if (
    !verifyWebhookSignature(
      rawBody,
      request.headers.get("x-dopa-signature"),
      secret,
      timestamp,
    )
  ) {
    return Response.json(
      { error: "Invalid callback signature." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  if (!isJsonObject(body)) {
    return Response.json(
      { error: "Invalid callback payload." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const runId = stringValue(body.runId, 64);
  const eventId = stringValue(body.eventId, 64);
  const summary = stringValue(body.summary, 240);
  const durationMs =
    typeof body.durationMs === "number" &&
    Number.isInteger(body.durationMs) &&
    body.durationMs >= 0 &&
    body.durationMs <= 300_000
      ? body.durationMs
      : null;
  if (
    !runId ||
    !isUuid(runId) ||
    !eventId ||
    !isUuid(eventId) ||
    !summary
  ) {
    return Response.json(
      { error: "Invalid callback payload." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const accepted = await appendProviderTrace({
    runId,
    summary,
    durationMs,
    metadata: {
      ...safeMetadata(body.metadata),
      providerEventId: eventId,
    },
  });
  return Response.json(
    { accepted },
    { status: accepted ? 202 : 404, headers: NO_STORE_HEADERS },
  );
}
