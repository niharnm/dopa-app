import assert from "node:assert/strict";
import {
  isPublicIpAddress,
  normalizeWebsiteUrl,
} from "../utils/public-url";
import {
  isSameOriginRequest,
  readJsonObjectRequest,
} from "../utils/http-security";
import {
  isUuid,
  normalizeOptionalHttpUrl,
} from "../lib/validation";
import { enforceApiQuota } from "../utils/api-quota";
import { normalizeDopaApiBaseUrl } from "../lib/dopa-api";

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

async function asyncTest(name: string, run: () => Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

test("normalizes public website URLs", () => {
  assert.equal(normalizeWebsiteUrl("example.com").href, "https://example.com/");
  assert.equal(
    normalizeWebsiteUrl("http://example.com/path").href,
    "http://example.com/path",
  );
});

test("rejects local, credentialed, and non-HTTP website URLs", () => {
  assert.throws(() => normalizeWebsiteUrl("http://localhost:3000"));
  assert.throws(() => normalizeWebsiteUrl("https://service.local"));
  assert.throws(() => normalizeWebsiteUrl("https://user:secret@example.com"));
  assert.throws(() => normalizeWebsiteUrl("https://example.com:8443"));
  assert.throws(() => normalizeWebsiteUrl("ftp://example.com"));
});

test("blocks private and special-use IP addresses", () => {
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.51.100.2",
    "::1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1",
    "2001:2::1",
    "2002:7f00:1::",
    "3fff::1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test("allows globally routable IP addresses", () => {
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("1.1.1.1"), true);
  assert.equal(
    isPublicIpAddress("2606:4700:4700::1111"),
    true,
  );
});

test("normalizes stored HTTP URLs and rejects unsafe schemes", () => {
  assert.deepEqual(normalizeOptionalHttpUrl("example.com"), {
    success: true,
    value: "https://example.com/",
  });
  assert.equal(normalizeOptionalHttpUrl("javascript:alert(1)").success, false);
  assert.equal(
    normalizeOptionalHttpUrl("https://user:secret@example.com").success,
    false,
  );
  assert.equal(normalizeOptionalHttpUrl("http://localhost:3000").success, false);
});

test("accepts canonical UUIDs only", () => {
  assert.equal(isUuid("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(isUuid("../other-user"), false);
  assert.equal(isUuid("123e4567e89b42d3a456426614174000"), false);
});

test("requires HTTPS for non-loopback scoring endpoints", () => {
  assert.equal(
    normalizeDopaApiBaseUrl("http://localhost:8000/"),
    "http://localhost:8000",
  );
  assert.equal(
    normalizeDopaApiBaseUrl("http://[::1]:8000/"),
    "http://[::1]:8000",
  );
  assert.equal(
    normalizeDopaApiBaseUrl("https://api.dopa.example/v1/"),
    "https://api.dopa.example/v1",
  );
  assert.throws(() => normalizeDopaApiBaseUrl("http://api.dopa.example"));
  assert.throws(() => normalizeDopaApiBaseUrl("http://127.evil.example"));
  assert.throws(() =>
    normalizeDopaApiBaseUrl("https://user:secret@api.dopa.example"),
  );
});

test("compares mutation origins against the actual request origin", () => {
  const allowed = new Request("https://dopa.example/api/test", {
    headers: { Origin: "https://dopa.example" },
  });
  const denied = new Request("https://dopa.example/api/test", {
    headers: { Origin: "https://evil.example" },
  });

  assert.equal(isSameOriginRequest(allowed), true);
  assert.equal(isSameOriginRequest(denied), false);
});

await asyncTest("parses bounded same-origin JSON objects", async () => {
  const result = await readJsonObjectRequest(
    new Request("https://dopa.example/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://dopa.example",
      },
      body: JSON.stringify({ value: "safe" }),
    }),
    64,
  );

  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data, { value: "safe" });
});

await asyncTest("rejects cross-origin, non-JSON, and oversized bodies", async () => {
  const crossOrigin = await readJsonObjectRequest(
    new Request("https://dopa.example/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: "{}",
    }),
  );
  const wrongType = await readJsonObjectRequest(
    new Request("https://dopa.example/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Origin: "https://dopa.example",
      },
      body: "{}",
    }),
  );
  const oversized = await readJsonObjectRequest(
    new Request("https://dopa.example/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://dopa.example",
      },
      body: JSON.stringify({ value: "x".repeat(100) }),
    }),
    32,
  );

  assert.equal(crossOrigin.success, false);
  assert.equal(wrongType.success, false);
  assert.equal(oversized.success, false);
  if (!crossOrigin.success) assert.equal(crossOrigin.response.status, 403);
  if (!wrongType.success) assert.equal(wrongType.response.status, 415);
  if (!oversized.success) assert.equal(oversized.response.status, 413);
});

await asyncTest("fails authenticated API quotas closed and returns retry timing", async () => {
  const denied = await enforceApiQuota(
    {
      async rpc() {
        return {
          data: [
            {
              allowed: false,
              retry_after_seconds: 42,
              remaining: 0,
            },
          ],
          error: null,
        };
      },
    },
    "keyword_generate",
  );
  const unavailable = await enforceApiQuota(
    {
      async rpc() {
        return { data: null, error: { code: "PGRST202" } };
      },
    },
    "keyword_generate",
  );

  assert.equal(denied?.status, 429);
  assert.equal(denied?.headers.get("Retry-After"), "42");
  assert.equal(unavailable?.status, 503);
});
