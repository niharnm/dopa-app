import { NO_STORE_HEADERS } from "@/utils/http-security";
import { NextResponse } from "next/server";

export type ApiQuotaBucket =
  | "business_auto_discover"
  | "competitor_discover"
  | "competitor_moves"
  | "keyword_generate"
  | "google_ads_read";

type QuotaClient = {
  rpc(
    functionName: string,
    args: Record<string, string>,
  ): PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
};

type QuotaResult = {
  allowed: boolean;
  retry_after_seconds: number;
  remaining: number;
};

function quotaResult(value: unknown): QuotaResult | null {
  const item = Array.isArray(value) ? value[0] : null;
  if (
    typeof item !== "object" ||
    item === null ||
    !("allowed" in item) ||
    typeof item.allowed !== "boolean" ||
    !("retry_after_seconds" in item) ||
    typeof item.retry_after_seconds !== "number" ||
    !("remaining" in item) ||
    typeof item.remaining !== "number"
  ) {
    return null;
  }

  return {
    allowed: item.allowed,
    retry_after_seconds: Math.max(1, Math.ceil(item.retry_after_seconds)),
    remaining: Math.max(0, Math.floor(item.remaining)),
  };
}

export async function enforceApiQuota(
  supabase: QuotaClient,
  bucket: ApiQuotaBucket,
): Promise<NextResponse | null> {
  const { data, error } = await supabase.rpc("consume_api_quota", {
    p_bucket: bucket,
  });
  const result = error ? null : quotaResult(data);

  if (!result) {
    console.error("Authenticated API quota check failed.", {
      bucket,
      code: error?.code ?? "invalid_response",
    });
    return NextResponse.json(
      { error: "Request protection is temporarily unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Too many requests. Try again later." },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        "Retry-After": String(result.retry_after_seconds),
      },
    },
  );
}
