import "server-only";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const LOCAL_DEVELOPMENT_SECRET =
  "dopa-fc-local-development-only-secret-do-not-use-in-production";

function signingSecret() {
  const configured = process.env.FC_DEMO_TOKEN_SECRET?.trim();
  if (
    configured &&
    new TextEncoder().encode(configured).byteLength >= 32
  ) {
    return configured;
  }
  if (process.env.NODE_ENV !== "production") return LOCAL_DEVELOPMENT_SECRET;
  throw new Error(
    "FC_DEMO_TOKEN_SECRET must contain at least 32 bytes in production.",
  );
}

export function randomOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHmac("sha256", signingSecret()).update(token).digest("hex");
}

export function safeTokenMatch(token: string, expectedHash: string) {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

export function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const address =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return createHmac("sha256", signingSecret())
    .update(`network:${address}`)
    .digest("hex");
}

export function verifyWebhookSignature(
  rawBody: string,
  suppliedSignature: string | null,
  secret: string,
  timestamp: string,
) {
  if (!suppliedSignature || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) {
    return false;
  }
  const actual = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();
  const expected = Buffer.from(suppliedSignature, "hex");
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}
