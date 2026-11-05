import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  DiscoveryError,
  discoverBusinessFromWebsite,
} from "@/lib/business-discovery";
import {
  ALIBABA_DEMO_URL,
  alibabaDemoProfile,
} from "@/lib/demo/alibaba-profile";
import { errorMessage, stringValue } from "@/lib/validation";
import { enforceAnonymousApiQuota } from "@/utils/api-quota";
import { NO_STORE_HEADERS, readJsonObjectRequest } from "@/utils/http-security";
import { createAdminClient } from "@/utils/supabase/admin";

function clientIp(req: Request): string {
  const platform = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (platform) return platform;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Hashed so the quota table never stores a raw address. */
function clientKey(req: Request): string {
  return createHash("sha256").update(`demo-discover:${clientIp(req)}`).digest("hex");
}

function looksLikeAlibaba(url: string): boolean {
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
    return host === "alibaba.com" || host.endsWith(".alibaba.com");
  } catch {
    return /alibaba\.com/i.test(url);
  }
}

/** Public, rate-limited discovery for the account-free /demo onboarding flow. */
export async function POST(req: Request) {
  try {
    const quotaResponse = await enforceAnonymousApiQuota(
      createAdminClient(),
      "business_demo_discover",
      clientKey(req),
    );
    if (quotaResponse) return quotaResponse;

    const parsedRequest = await readJsonObjectRequest(req, 4_096);
    if (!parsedRequest.success) return parsedRequest.response;

    const websiteUrl = stringValue(parsedRequest.data.websiteUrl, 2_048);
    if (!websiteUrl) {
      return NextResponse.json(
        { error: "Website URL is required." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    try {
      const result = await discoverBusinessFromWebsite(websiteUrl);
      return NextResponse.json(
        {
          success: true,
          profile: result.profile,
          websiteUrl: result.websiteUrl,
          source: "live",
        },
        { headers: NO_STORE_HEADERS },
      );
    } catch (error: unknown) {
      if (looksLikeAlibaba(websiteUrl)) {
        return NextResponse.json(
          {
            success: true,
            profile: alibabaDemoProfile,
            websiteUrl: ALIBABA_DEMO_URL,
            source: "demo_fixture",
          },
          { headers: NO_STORE_HEADERS },
        );
      }
      if (error instanceof DiscoveryError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status, headers: NO_STORE_HEADERS },
        );
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error("Demo business discovery failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      {
        error: errorMessage(
          error,
          "Failed to auto-discover business profile.",
        ),
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
