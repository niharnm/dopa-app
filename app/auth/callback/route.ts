import { createClient } from "@/utils/supabase/server";
import {
  GOOGLE_ADS_TOKEN_COOKIE,
  GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
  sealGoogleAdsToken,
} from "@/utils/google-ads-token";
import { safeNextUrl } from "@/utils/safe-next-url";
import { NO_STORE_HEADERS } from "@/utils/http-security";
import { siteOriginFromRequest } from "@/utils/site-origin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let origin: string;
  try {
    origin = siteOriginFromRequest(request.url);
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
    const supabase = createClient(await cookies());
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(redirectUrl);

      if (googleAdsRequested) {
        const providerToken = data.session?.provider_token;
        const providerRefreshToken =
          data.session?.provider_refresh_token;
        const encryptionKey =
          process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY;

        if (!providerToken || !providerRefreshToken) {
          redirectUrl.searchParams.set("googleAds", "oauth_error");
          return NextResponse.redirect(redirectUrl);
        }

        if (!encryptionKey) {
          redirectUrl.searchParams.set(
            "googleAds",
            "configuration_required",
          );
          return NextResponse.redirect(redirectUrl);
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
          return NextResponse.redirect(redirectUrl);
        }
        response.cookies.set(GOOGLE_ADS_TOKEN_COOKIE, sealedToken, {
          httpOnly: true,
          secure: new URL(origin).protocol === "https:",
          sameSite: "lax",
          path: "/",
          maxAge: GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
        });
      }

      return response;
    }
  }

  const failureUrl = new URL("/login", origin);
  failureUrl.searchParams.set("error", "Could not authenticate");
  return NextResponse.redirect(failureUrl);
}
