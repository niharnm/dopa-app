import { NextResponse } from "next/server";
import {
  isJsonObject,
  parseGroqJson,
  stringValue,
} from "@/lib/validation";
import { getApiAuth } from "@/utils/api-auth";
import { enforceApiQuota } from "@/utils/api-quota";
import { readJsonObjectRequest } from "@/utils/http-security";

export interface DiscoveredCompetitor {
  name: string;
  website_url: string;
  primary_angle: string;
  overlap: string;
  predicted_ctr: number;
}

function normalizeCompetitors(value: unknown): DiscoveredCompetitor[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isJsonObject(item)) return [];
    const name = stringValue(item.name, 160);
    if (!name) return [];

    const rawCtr =
      typeof item.predicted_ctr === "number"
        ? item.predicted_ctr
        : Number(item.predicted_ctr);
    const predictedCtr = Number.isFinite(rawCtr)
      ? Math.min(100, Math.max(0, rawCtr))
      : 0;

    return [
      {
        name,
        website_url: stringValue(item.website_url, 2_048) ?? "",
        primary_angle: stringValue(item.primary_angle, 1_000) ?? "",
        overlap: stringValue(item.overlap, 120) ?? "Suggested rival",
        predicted_ctr: predictedCtr,
      },
    ];
  }).slice(0, 5);
}

export async function POST(req: Request) {
  try {
    const parsedRequest = await readJsonObjectRequest(req, 8_192);
    if (!parsedRequest.success) return parsedRequest.response;

    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Sign in before discovering competitors." },
        { status: 401 },
      );
    }

    const quotaResponse = await enforceApiQuota(
      auth.supabase,
      "competitor_discover",
    );
    if (quotaResponse) return quotaResponse;

    const body = parsedRequest.data;
    const businessName = stringValue(body.businessName, 160);
    const industry = stringValue(body.industry, 120);
    const targetAudience = stringValue(body.targetAudience, 1_000);
    const website = stringValue(body.website, 2_048);
    if (!businessName) {
      return NextResponse.json(
        { error: "Business name is required." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Competitor discovery is not configured yet." },
        { status: 503 }
      );
    }

    const prompt = `Suggest likely competitors for the following brand:
Brand Name: ${businessName}
Industry: ${industry || "E-commerce / Technology"}
Target Audience: ${targetAudience || "General Audience"}
Website: ${website || "N/A"}

Suggest up to 5 likely industry competitors. These are hypotheses for the user to verify, not live market research. Return a structured JSON response matching this schema:
{
  "competitors": [
    {
      "name": "Competitor Brand Name",
      "website_url": "https://competitor.com",
      "primary_angle": "Core advertising hook or positioning strategy",
      "overlap": "High / Medium / Direct Rival",
      "predicted_ctr": 1.45
    }
  ]
}`;

    const systemPrompt = `You are a competitive research assistant for ad campaigns.
Return ONLY a valid JSON object containing an array "competitors" of exactly 5 competitor objects.
The predicted_ctr field is only a clearly labeled AI estimate, not observed campaign data.`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    });

    if (!groqRes.ok) {
      return NextResponse.json(
        { error: "Competitor suggestions are temporarily unavailable." },
        { status: 502 },
      );
    }

    const groqData: unknown = await groqRes.json();
    const parsed = parseGroqJson(groqData);

    return NextResponse.json({
      competitors: normalizeCompetitors(parsed.competitors),
    });
  } catch (error: unknown) {
    console.error("Competitor discovery failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to discover competitors." },
      { status: 500 },
    );
  }
}
