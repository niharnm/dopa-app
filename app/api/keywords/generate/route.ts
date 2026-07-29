import { NextResponse } from "next/server";
import { fetchGoogleTrendsData } from "@/utils/google-trends-client";
import {
  fetchKeywordMetrics,
  type GoogleAdsCredentials,
} from "@/utils/google-ads-client";
import {
  isJsonObject,
  parseGroqJson,
  stringValue,
} from "@/lib/validation";
import { getApiAuth } from "@/utils/api-auth";
import { getGoogleAdsSession } from "@/utils/google-ads-session";
import {
  GOOGLE_ADS_TOKEN_COOKIE,
  GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
} from "@/utils/google-ads-token";
import { enforceApiQuota } from "@/utils/api-quota";
import { readJsonObjectRequest } from "@/utils/http-security";

export interface KeywordResult {
  keyword: string;
  category: "commercial" | "problem" | "competitor" | "long_tail";
  intentDescription: string;
  estimatedSearchVolume: string;
  suggestedAdHeadline: string;
  cpcFormatted?: string;
  trendSignal?: string;
  isSurging?: boolean;
  sources: string[];
  volumeSource: "Google Ads" | "AI estimate";
}

type GeneratedKeyword = Omit<
  KeywordResult,
  "cpcFormatted" | "trendSignal" | "isSurging" | "sources" | "volumeSource"
>;

function keywordCategory(
  value: string | undefined,
): KeywordResult["category"] | null {
  switch (value) {
    case "commercial":
    case "problem":
    case "competitor":
    case "long_tail":
      return value;
    default:
      return null;
  }
}

function normalizeGeneratedKeywords(value: unknown): GeneratedKeyword[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isJsonObject(item)) return [];
    const keyword = stringValue(item.keyword, 120);
    const intentDescription = stringValue(item.intentDescription, 500);
    const estimatedSearchVolume = stringValue(
      item.estimatedSearchVolume,
      80,
    );
    const suggestedAdHeadline = stringValue(item.suggestedAdHeadline, 30);
    const category = keywordCategory(stringValue(item.category, 40));
    if (
      !keyword ||
      !intentDescription ||
      !estimatedSearchVolume ||
      !suggestedAdHeadline ||
      !category
    ) {
      return [];
    }

    return [
      {
        keyword,
        category,
        intentDescription,
        estimatedSearchVolume,
        suggestedAdHeadline,
      },
    ];
  }).slice(0, 12);
}

export async function POST(req: Request) {
  try {
    const parsedRequest = await readJsonObjectRequest(req, 16_384);
    if (!parsedRequest.success) return parsedRequest.response;

    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Sign in before generating keywords." },
        { status: 401 },
      );
    }

    const quotaResponse = await enforceApiQuota(
      auth.supabase,
      "keyword_generate",
    );
    if (quotaResponse) return quotaResponse;

    const body = parsedRequest.data;
    const scope = body.scope === "product" ? "product" : "brand";
    const businessName = stringValue(body.businessName, 160);
    const targetDemographic = stringValue(body.targetDemographic, 1_000);
    const productName = stringValue(body.productName, 160);
    const valueProp = stringValue(body.valueProp, 1_000);
    const price =
      typeof body.price === "number" && Number.isFinite(body.price)
        ? String(body.price)
        : stringValue(body.price, 60);
    if (!businessName) {
      return NextResponse.json(
        { error: "Business name is required." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Keyword generation is not configured yet." },
        { status: 503 }
      );
    }

    const isProductScope = scope === "product" && Boolean(productName);

    const prompt = isProductScope
      ? `Generate a targeted campaign keyword strategy for the following product:
Brand Name: ${businessName}
Product Name: ${productName}
Value Proposition: ${valueProp || "N/A"}
Price Point: ${price ? `$${price}` : "N/A"}
Target Audience / Demographic: ${targetDemographic || "General Consumers"}`
      : `Generate a brand-level keyword strategy for the following business:
Brand Name: ${businessName}
Target Audience / Demographic: ${targetDemographic || "General Consumers"}`;

    const systemPrompt = `You are an expert Google Ads and AI Campaign Keyword Strategist.
Return a valid JSON object containing an array "keywords" of exactly 12 keyword objects.
Each keyword object MUST have:
- "keyword": exact search query phrase (2-5 words)
- "category": one of ["commercial", "problem", "competitor", "long_tail"]
- "intentDescription": brief 1-sentence explanation of why searchers type this query
- "estimatedSearchVolume": realistic monthly volume range string (e.g., "1K - 10K", "10K - 50K")
- "suggestedAdHeadline": high-converting Google RSA ad headline (max 30 chars)

Response format MUST be strict JSON matching this schema:
{
  "keywords": [
    {
      "keyword": "example query",
      "category": "commercial",
      "intentDescription": "High buying intent",
      "estimatedSearchVolume": "5K - 20K",
      "suggestedAdHeadline": "Best Quality Product Here"
    }
  ]
}`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Keyword suggestions are temporarily unavailable." },
        { status: 502 },
      );
    }

    const data: unknown = await response.json();
    const parsed = parseGroqJson(data);
    const rawKeywords = normalizeGeneratedKeywords(parsed.keywords);
    if (rawKeywords.length === 0) {
      throw new Error("The AI service returned no usable keyword suggestions.");
    }

    const seed = isProductScope && productName ? productName : businessName;
    const trendsSignals = await fetchGoogleTrendsData(seed);
    const trendTopics = trendsSignals.map(({ query }) => query.toLowerCase());

    const googleAdsSession = await getGoogleAdsSession(
      auth.cookieStore,
      auth.user.id,
    );
    const adsCredentials: GoogleAdsCredentials = {
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID ?? "",
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      accessToken: googleAdsSession.accessToken,
    };

    const kwList = rawKeywords.map((keyword) => keyword.keyword);
    const googleAdsMetrics = await fetchKeywordMetrics(adsCredentials, kwList);

    const enrichedKeywords: KeywordResult[] = rawKeywords.map(
      (item) => {
        const lowerKw = item.keyword.toLowerCase();
        const adsMetric = googleAdsMetrics[lowerKw];
        const hasRelatedTrendTopic = trendTopics.some(
          (topic) => topic.includes(lowerKw) || lowerKw.includes(topic),
        );
        const sources = ["AI suggestion"];
        if (adsMetric) {
          sources.push("Google Ads API");
        }
        if (hasRelatedTrendTopic) sources.push("Google Trends topic");

        return {
          keyword: item.keyword,
          category: item.category,
          intentDescription: item.intentDescription,
          suggestedAdHeadline: item.suggestedAdHeadline,
          cpcFormatted: adsMetric?.cpcFormatted,
          estimatedSearchVolume: adsMetric
            ? `${adsMetric.avgMonthlySearches.toLocaleString()} monthly`
            : item.estimatedSearchVolume,
          trendSignal: hasRelatedTrendTopic ? "Related topic" : undefined,
          isSurging: false,
          sources,
          volumeSource: adsMetric ? "Google Ads" : "AI estimate",
        };
      },
    );

    const nextResponse = NextResponse.json({
      keywords: enrichedKeywords,
      scopeUsed: isProductScope ? "product" : "brand",
    });
    if (googleAdsSession.clearCookie) {
      nextResponse.cookies.delete(GOOGLE_ADS_TOKEN_COOKIE);
    } else if (googleAdsSession.refreshedCookie) {
      nextResponse.cookies.set(
        GOOGLE_ADS_TOKEN_COOKIE,
        googleAdsSession.refreshedCookie,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: GOOGLE_ADS_TOKEN_MAX_AGE_SECONDS,
        },
      );
    }
    return nextResponse;
  } catch (error: unknown) {
    console.error("Keyword generation failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to generate keywords." },
      { status: 500 },
    );
  }
}
