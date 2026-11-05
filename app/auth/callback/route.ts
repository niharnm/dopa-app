import { createClient } from "@/utils/supabase/server";
import {
  GOOGLE_ADS_TOKEN_COOKIE,
  GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
  isValidGoogleAdsTokenEncryptionKey,
  sealGoogleAdsToken,
} from "@/utils/google-ads-token";
import { safeNextUrl } from "@/utils/safe-next-url";
import { NO_STORE_HEADERS } from "@/utils/http-security";
import { authCallbackOrigin } from "@/utils/site-origin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function privateRedirect(url: URL) {
  return NextResponse.redirect(url, { headers: NO_STORE_HEADERS });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let origin: string;
  try {
    origin = authCallbackOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Authentication is not configured for this deployment." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  const code = searchParams.get("code");
  const redirectUrl = safeNextUrl(searchParams.get("next"), origin);
  const googleAdsRequested = searchParams.get("google_ads") === "1";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (googleAdsRequested) {
        const providerToken = data.session?.provider_token;
        const providerRefreshToken =
          data.session?.provider_refresh_token ?? undefined;
        const encryptionKey =
          process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY;

        if (!providerToken) {
          redirectUrl.searchParams.set("googleAds", "oauth_error");
          return privateRedirect(redirectUrl);
        }

        if (!isValidGoogleAdsTokenEncryptionKey(encryptionKey)) {
          redirectUrl.searchParams.set(
            "googleAds",
            "configuration_required",
          );
          return privateRedirect(redirectUrl);
        }

        let sealedToken: string;
        try {
          sealedToken = await sealGoogleAdsToken(
            {
              accessToken: providerToken,
              refreshToken: providerRefreshToken,
            },
            encryptionKey,
            data.session.user.id,
          );
        } catch {
          redirectUrl.searchParams.set(
            "googleAds",
            "configuration_required",
          );
          return privateRedirect(redirectUrl);
        }
        redirectUrl.searchParams.set(
          "googleAds",
          providerRefreshToken ? "connected" : "connected_temporary",
        );
        const response = privateRedirect(redirectUrl);
        response.cookies.set(GOOGLE_ADS_TOKEN_COOKIE, sealedToken, {
          httpOnly: true,
          secure: new URL(request.url).protocol === "https:",
          sameSite: "lax",
          path: "/",
          maxAge: GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
        });
        return response;
      }

      return privateRedirect(redirectUrl);
    }
  }

  const failureUrl = new URL("/login", origin);
  failureUrl.searchParams.set("error", "Could not authenticate");
  return privateRedirect(failureUrl);
}
