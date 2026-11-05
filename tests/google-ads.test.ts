import assert from "node:assert/strict";
import {
  fetchKeywordMetrics,
  fetchLiveGoogleAdsData,
  refreshGoogleAccessToken,
  resolveGoogleAdsCustomers,
} from "../utils/google-ads-client";
import {
  isGoogleAdsAccessTokenFresh,
  isValidGoogleAdsTokenEncryptionKey,
  openGoogleAdsToken,
  sealGoogleAdsToken,
} from "../utils/google-ads-token";
import { safeNextPath, safeNextUrl } from "../utils/safe-next-url";
import { googleAdsOnboardingFor } from "../components/dashboard/google-ads-onboarding-content";

const originalFetch = globalThis.fetch;

async function test(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`✓ ${name}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await test("rejects missing Google Ads configuration without a request", async () => {
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    throw new Error("Unexpected request");
  }) as typeof fetch;

  const result = await fetchLiveGoogleAdsData({
    customerId: "",
    developerToken: "",
  });

  assert.equal(result.success, false);
  assert.equal(result.code, "configuration_required");
  assert.equal(requests, 0);
});

await test("uses v25 and maps live campaign fields", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify([
        {
          results: [
            {
              customer: {
                descriptiveName: "Dopa Test Account",
                currencyCode: "USD",
                timeZone: "America/Los_Angeles",
              },
              campaign: {
                id: "42",
                name: "Search Launch",
                status: "ENABLED",
                advertisingChannelType: "SEARCH",
              },
              metrics: {
                costMicros: "125500000",
                impressions: "10000",
                clicks: "250",
                ctr: 0.025,
                conversions: 12,
                conversionsValue: 500,
              },
            },
          ],
        },
      ]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "request-id": "request-42",
        },
      },
    );
  }) as typeof fetch;

  const result = await fetchLiveGoogleAdsData({
    customerId: "123-456-7890",
    developerToken: "developer-token",
    loginCustomerId: "987-654-3210",
    accessToken: "access-token",
  });
  const headers = new Headers(requestInit?.headers);

  assert.equal(result.success, true);
  assert.equal(
    requestUrl,
    "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream",
  );
  assert.equal(headers.get("Authorization"), "Bearer access-token");
  assert.equal(headers.get("developer-token"), "developer-token");
  assert.equal(headers.get("login-customer-id"), "9876543210");
  assert.equal(result.requestId, "request-42");
  assert.deepEqual(result.campaigns[0], {
    id: "42",
    name: "Search Launch",
    status: "ENABLED",
    channelType: "SEARCH",
    spend: 125.5,
    impressions: 10000,
    clicks: 250,
    ctr: 2.5,
    conversions: 12,
    conversionsValue: 500,
    roas: 3.98,
  });
});

await test("requests current 12-month keyword history without fabricated CPC", async () => {
  let requestBody = "";
  globalThis.fetch = (async (_input, init) => {
    requestBody = String(init?.body);
    return new Response(
      JSON.stringify({
        results: [
          {
            text: "running watch",
            keywordMetrics: {
              avgMonthlySearches: "3200",
              lowTopOfPageBidMicros: "0",
              highTopOfPageBidMicros: "0",
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const result = await fetchKeywordMetrics(
    {
      customerId: "1234567890",
      developerToken: "developer-token",
      accessToken: "access-token",
    },
    ["running watch"],
  );
  const parsedBody = JSON.parse(requestBody) as Record<string, unknown>;

  assert.equal("historicalMetricsOptions" in parsedBody, false);
  assert.equal(result["running watch"]?.avgMonthlySearches, 3200);
  assert.equal(result["running watch"]?.cpcFormatted, undefined);
});

await test("queries the connected user's accessible accounts, not the operator's", async () => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
    });
    return new Response(
      JSON.stringify({
        resourceNames: ["customers/1111111111", "customers/2222222222", "bad"],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const env = {
    GOOGLE_ADS_CUSTOMER_ID: "9999999999",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "8888888888",
  };
  const result = await resolveGoogleAdsCustomers({
    accessToken: "user-token",
    developerToken: "dev",
    env,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.customerIds, [
    "1111111111",
    "2222222222",
  ]);
  assert.equal(result.ok && result.loginCustomerId, undefined);
  assert.match(requests[0]?.url ?? "", /customers:listAccessibleCustomers$/);
  assert.equal(requests[0]?.headers.Authorization, "Bearer user-token");

  const picked = await resolveGoogleAdsCustomers({
    accessToken: "user-token",
    developerToken: "dev",
    requestedCustomerId: "222-222-2222",
    env,
  });
  assert.deepEqual(picked.ok && picked.customerIds, ["2222222222"]);

  const foreign = await resolveGoogleAdsCustomers({
    accessToken: "user-token",
    developerToken: "dev",
    requestedCustomerId: "9999999999",
    env,
  });
  assert.equal(foreign.ok, false);
  assert.equal(!foreign.ok && foreign.code, "access_denied");
});

await test("reports an error when the user has no accessible Google Ads account", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
  const result = await resolveGoogleAdsCustomers({
    accessToken: "user-token",
    developerToken: "dev",
    env: { GOOGLE_ADS_CUSTOMER_ID: "9999999999" },
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "access_denied");
});

await test("uses the operator customer only through the explicit fallback", async () => {
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    throw new Error("Unexpected request");
  }) as typeof fetch;
  const result = await resolveGoogleAdsCustomers({
    accessToken: "operator-token",
    developerToken: "dev",
    env: {
      GOOGLE_ADS_ALLOW_ENV_CUSTOMER: "true",
      GOOGLE_ADS_CUSTOMER_ID: "999-999-9999",
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: "8888888888",
    },
  });
  assert.deepEqual(result.ok && result.customerIds, ["9999999999"]);
  assert.equal(result.ok && result.source, "operator_fallback");
  assert.equal(result.ok && result.loginCustomerId, "8888888888");
  assert.equal(requests, 0);
});

await test("refreshes a server-side OAuth token", async () => {
  let body = "";
  globalThis.fetch = (async (_input, init) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({ access_token: "refreshed-access-token" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const token = await refreshGoogleAccessToken(
    "client-id",
    "client-secret",
    "refresh-token",
  );

  assert.equal(token, "refreshed-access-token");
  assert.match(body, /grant_type=refresh_token/);
  assert.match(body, /refresh_token=refresh-token/);
});

await test("encrypts, binds, expires, and rejects tampered OAuth tokens", async () => {
  const secret = Buffer.alloc(32, 7).toString("base64");
  const now = 1_000_000;
  const sealed = await sealGoogleAdsToken(
    {
      accessToken: "google-access-token",
      refreshToken: "google-refresh-token",
    },
    secret,
    "user-123",
    now,
  );

  assert.equal(sealed.includes("google-access-token"), false);
  const opened = await openGoogleAdsToken(
    sealed,
    secret,
    "user-123",
    now,
  );
  assert.deepEqual(opened, {
    accessToken: "google-access-token",
    refreshToken: "google-refresh-token",
    accessTokenExpiresAt: now + 55 * 60 * 1000,
  });
  assert.ok(opened);
  assert.equal(isGoogleAdsAccessTokenFresh(opened, now), true);
  assert.equal(
    await openGoogleAdsToken(sealed, secret, "different-user", now),
    null,
  );

  const [version, iv, ciphertext] = sealed.split(".");
  assert.ok(version && iv && ciphertext);
  const tamperedCiphertext = `${
    ciphertext.startsWith("a") ? "b" : "a"
  }${ciphertext.slice(1)}`;
  assert.equal(
    await openGoogleAdsToken(
      [version, iv, tamperedCiphertext].join("."),
      secret,
      "user-123",
      now,
    ),
    null,
  );
});

await test("keeps a fresh Google access token when no refresh token is returned", async () => {
  const secret = Buffer.alloc(32, 9).toString("base64");
  const now = 2_000_000;
  const sealed = await sealGoogleAdsToken(
    {
      accessToken: "temporary-google-access-token",
      refreshToken: undefined,
    },
    secret,
    "user-456",
    now,
  );

  assert.deepEqual(
    await openGoogleAdsToken(sealed, secret, "user-456", now),
    {
      accessToken: "temporary-google-access-token",
      refreshToken: undefined,
      accessTokenExpiresAt: now + 55 * 60 * 1000,
    },
  );
});

await test("rejects malformed Google Ads token encryption keys", async () => {
  assert.equal(
    isValidGoogleAdsTokenEncryptionKey(Buffer.alloc(32, 4).toString("base64")),
    true,
  );
  assert.equal(
    isValidGoogleAdsTokenEncryptionKey(Buffer.alloc(31, 4).toString("base64")),
    false,
  );
  assert.equal(isValidGoogleAdsTokenEncryptionKey("not-base64"), false);
  assert.equal(isValidGoogleAdsTokenEncryptionKey(undefined), false);
});

await test("keeps authentication redirects on the Dopa origin", async () => {
  const origin = "https://dopa.example";

  assert.equal(
    safeNextUrl("/dashboard?tab=googleAds", origin).href,
    "https://dopa.example/dashboard?tab=googleAds",
  );
  assert.equal(
    safeNextPath("https://evil.example", origin),
    "/dashboard",
  );
  assert.equal(safeNextPath("//evil.example", origin), "/dashboard");
  assert.equal(safeNextPath("/\\evil.example", origin), "/dashboard");
});

await test("guides an authorized user through manager and API access", async () => {
  const onboarding = googleAdsOnboardingFor({
    errorCode: "access_denied",
    oauthResult: "connected",
  });

  assert.match(onboarding.title, /sign-in worked/i);
  assert.match(onboarding.message, /customer account/i);
  assert.match(onboarding.message, /manager account/i);
  assert.deepEqual(
    onboarding.steps.map(({ state }) => state),
    ["complete", "current", "current"],
  );
  assert.match(onboarding.steps[1]?.description ?? "", /link request/i);
  assert.match(onboarding.steps[2]?.description ?? "", /Basic or Standard/i);
  assert.match(onboarding.prompt, /Basic API access/i);
});

await test("keeps reconnecting as the active step when OAuth is required", async () => {
  const onboarding = googleAdsOnboardingFor({
    errorCode: "oauth_required",
    oauthResult: "connected",
  });

  assert.equal(onboarding.steps[0]?.state, "current");
  assert.match(onboarding.steps[0]?.label ?? "", /Sign in with Google/i);
  assert.match(onboarding.message, /cannot create ads/i);
});

await test("separates Dopa configuration and temporary Google failures", async () => {
  const configuration = googleAdsOnboardingFor({
    errorCode: "configuration_required",
  });
  const temporaryFailure = googleAdsOnboardingFor({
    errorCode: "network_error",
  });

  assert.match(configuration.title, /Dopa configuration/i);
  assert.match(configuration.message, /administrator/i);
  assert.match(temporaryFailure.title, /did not answer/i);
  assert.match(temporaryFailure.steps[0]?.label ?? "", /Retry/i);
});
