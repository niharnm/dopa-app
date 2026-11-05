import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  fetchLiveGoogleAdsData,
  refreshGoogleAccessToken,
  resolveGoogleAdsCustomers,
  type GoogleAdsApiResponse,
  type GoogleAdsCredentials,
} from "@/utils/google-ads-client";
import {
  GOOGLE_ADS_TOKEN_COOKIE,
  GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
  isGoogleAdsAccessTokenFresh,
  isValidGoogleAdsTokenEncryptionKey,
  openGoogleAdsToken,
  sealGoogleAdsToken,
} from "@/utils/google-ads-token";
import { enforceApiQuota } from "@/utils/api-quota";
import {
  isSameOriginRequest,
  NO_STORE_HEADERS,
} from "@/utils/http-security";

function json(
  body: GoogleAdsApiResponse | Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

async function authenticatedCookieStore() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { cookieStore, supabase, userId: user.id } : null;
}

function environmentCredentials(accessToken?: string): GoogleAdsCredentials {
  // The customer account comes from the connected user's own access (or the
  // explicit operator fallback), never from a shared environment default.
  return {
    customerId: "",
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    accessToken,
  };
}

export async function GET(request: Request) {
  const auth = await authenticatedCookieStore();
  if (!auth) {
    return json(
      {
        success: false,
        configured: false,
        source: "unavailable",
        code: "oauth_required",
        error: "Sign in to Dopa before accessing Google Ads.",
        campaigns: [],
      },
      401,
    );
  }

  const quotaResponse = await enforceApiQuota(
    auth.supabase,
    "google_ads_read",
  );
  if (quotaResponse) return quotaResponse;

  const { cookieStore, userId } = auth;
  const credentials = environmentCredentials();
  const encryptionKey = process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY;
  const oauthClientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const oauthClientSecret =
    process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  const missingEnvVars = [
    !credentials.developerToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
    !isValidGoogleAdsTokenEncryptionKey(encryptionKey) &&
      "GOOGLE_ADS_TOKEN_ENCRYPTION_KEY",
    !oauthClientId && "GOOGLE_ADS_OAUTH_CLIENT_ID",
    !oauthClientSecret && "GOOGLE_ADS_OAUTH_CLIENT_SECRET",
  ].filter((name): name is string => Boolean(name));

  if (missingEnvVars.length > 0) {
    return json(
      {
        success: false,
        configured: false,
        source: "unavailable",
        code: "configuration_required",
        error: "Google Ads server configuration is incomplete or invalid.",
        campaigns: [],
      },
      503,
    );
  }

  const sealedToken = cookieStore.get(GOOGLE_ADS_TOKEN_COOKIE)?.value;
  let refreshedTokenCookie: string | undefined;
  if (
    sealedToken &&
    encryptionKey &&
    oauthClientId &&
    oauthClientSecret
  ) {
    const tokens = await openGoogleAdsToken(
      sealedToken,
      encryptionKey,
      userId,
    );

    if (tokens && isGoogleAdsAccessTokenFresh(tokens)) {
      credentials.accessToken = tokens.accessToken;
    } else if (tokens?.refreshToken) {
      try {
        credentials.accessToken = await refreshGoogleAccessToken(
          oauthClientId,
          oauthClientSecret,
          tokens.refreshToken,
        );
        refreshedTokenCookie = await sealGoogleAdsToken(
          {
            accessToken: credentials.accessToken,
            refreshToken: tokens.refreshToken,
          },
          encryptionKey,
          userId,
        );
      } catch {
        const response = json(
          {
            success: false,
            configured: true,
            source: "unavailable",
            code: "oauth_required",
            error:
              "Google Ads authorization expired. Reconnect your account.",
            campaigns: [],
          },
          428,
        );
        response.cookies.delete(GOOGLE_ADS_TOKEN_COOKIE);
        return response;
      }
    } else if (tokens) {
      const response = json(
        {
          success: false,
          configured: true,
          source: "unavailable",
          code: "oauth_required",
          error: "Google Ads authorization expired. Reconnect your account.",
          campaigns: [],
        },
        428,
      );
      response.cookies.delete(GOOGLE_ADS_TOKEN_COOKIE);
      return response;
    }
  }

  if (!credentials.accessToken) {
    const response = json(
      {
        success: false,
        configured: true,
        source: "unavailable",
        code: "oauth_required",
        error: "Connect Google Ads to authorize campaign access.",
        campaigns: [],
      },
      428,
    );
    if (sealedToken) response.cookies.delete(GOOGLE_ADS_TOKEN_COOKIE);
    return response;
  }

  const requestedCustomerId = new URL(request.url).searchParams.get(
    "customerId",
  );
  const resolution = await resolveGoogleAdsCustomers({
    accessToken: credentials.accessToken,
    developerToken: credentials.developerToken,
    requestedCustomerId,
  });
  if (!resolution.ok) {
    const response = json(
      {
        success: false,
        configured: resolution.code !== "configuration_required",
        source: "unavailable",
        code: resolution.code,
        error: resolution.error,
        campaigns: [],
      },
      resolution.code === "oauth_required"
        ? 428
        : resolution.code === "access_denied"
          ? 403
          : resolution.code === "configuration_required"
            ? 503
            : 502,
    );
    if (resolution.code === "oauth_required") {
      response.cookies.delete(GOOGLE_ADS_TOKEN_COOKIE);
    }
    return response;
  }
  credentials.loginCustomerId = resolution.loginCustomerId;

  // A user may reach several accounts, and manager accounts have no campaign
  // data, so try each candidate until one answers.
  let result = await fetchLiveGoogleAdsData({
    ...credentials,
    customerId: resolution.customerIds[0] ?? "",
  });
  for (const customerId of resolution.customerIds.slice(1)) {
    if (result.success || result.code === "oauth_required") break;
    result = await fetchLiveGoogleAdsData({ ...credentials, customerId });
  }
  const status =
    result.success
      ? 200
      : result.code === "oauth_required"
        ? 428
        : result.code === "access_denied"
          ? 403
          : result.code === "configuration_required"
            ? 503
            : 502;
  const response = json(result, status);

  if (
    sealedToken &&
    (!credentials.accessToken || result.code === "oauth_required")
  ) {
    response.cookies.delete(GOOGLE_ADS_TOKEN_COOKIE);
  } else if (refreshedTokenCookie) {
    response.cookies.set(
      GOOGLE_ADS_TOKEN_COOKIE,
      refreshedTokenCookie,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
      },
    );
  }

  return response;
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return json({ error: "This request origin is not allowed." }, 403);
  }

  const auth = await authenticatedCookieStore();
  if (!auth) {
    return json({ error: "Authentication required." }, 401);
  }

  const response = json({ success: true });
  response.cookies.delete(GOOGLE_ADS_TOKEN_COOKIE);
  return response;
}
