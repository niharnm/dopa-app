import { NextResponse } from "next/server";
import {
  isJsonObject,
  parseGroqJson,
  stringValue,
} from "@/lib/validation";
import { getApiAuth } from "@/utils/api-auth";
import { enforceApiQuota } from "@/utils/api-quota";
import { readJsonObjectRequest } from "@/utils/http-security";

export interface CompetitorMove {
  move_type: "ad_launched" | "price_change" | "positioning_pivot" | "hook_change";
  title: string;
  description: string;
  risk_level: "low" | "medium" | "high";
  predicted_ctr: number;
  timeAgo: string;
}

function normalizedMoveType(
  value: string | undefined,
): CompetitorMove["move_type"] {
  switch (value) {
    case "ad_launched":
    case "price_change":
    case "positioning_pivot":
    case "hook_change":
      return value;
    default:
      return "positioning_pivot";
  }
}

function normalizedRiskLevel(
  value: string | undefined,
): CompetitorMove["risk_level"] {
  switch (value) {
    case "low":
    case "medium":
    case "high":
      return value;
    default:
      return "medium";
  }
}

function normalizeMoves(value: unknown): CompetitorMove[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isJsonObject(item)) return [];
    const title = stringValue(item.title, 200);
    const description = stringValue(item.description, 1_000);
    if (!title || !description) return [];

    const moveType = stringValue(item.move_type, 80);
    const riskLevel = stringValue(item.risk_level, 40);
    const rawCtr =
      typeof item.predicted_ctr === "number"
        ? item.predicted_ctr
        : Number(item.predicted_ctr);

    return [
      {
        move_type: normalizedMoveType(moveType),
        title,
        description,
        risk_level: normalizedRiskLevel(riskLevel),
        predicted_ctr: Number.isFinite(rawCtr)
          ? Math.min(100, Math.max(0, rawCtr))
          : 0,
        timeAgo: "AI scenario",
      },
    ];
  }).slice(0, 4);
}

export async function POST(req: Request) {
  try {
    const parsedRequest = await readJsonObjectRequest(req, 4_096);
    if (!parsedRequest.success) return parsedRequest.response;

    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Sign in before generating competitor scenarios." },
        { status: 401 },
      );
    }

    const quotaResponse = await enforceApiQuota(
      auth.supabase,
      "competitor_moves",
    );
    if (quotaResponse) return quotaResponse;

    const body = parsedRequest.data;
    const competitorName = stringValue(body.competitorName, 160);
    const primaryAngle = stringValue(body.primaryAngle, 1_000);
    if (!competitorName) {
      return NextResponse.json(
        { error: "Competitor name is required." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Competitor scenarios are not configured yet." },
        { status: 503 }
      );
    }

    const prompt = `Generate four plausible advertising scenarios to watch for competitor: ${competitorName} (Known strategy: ${primaryAngle || "Direct competitor"}).

Do not claim these events happened. They are planning hypotheses, not observed news or live market data. Return a structured JSON object containing an array "moves" matching this schema:
{
  "moves": [
    {
      "move_type": "ad_launched",
      "title": "Short action title",
      "description": "Explanation of the ad campaign shift or offer move",
      "risk_level": "high",
      "predicted_ctr": 1.65,
      "timeAgo": "AI scenario"
    }
  ]
}`;

    const systemPrompt = `You are a competitive planning assistant.
Return ONLY valid JSON. Ensure risk_level is one of ['low', 'medium', 'high'] and move_type is one of ['ad_launched', 'price_change', 'positioning_pivot', 'hook_change'].`;

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
        { error: "Competitor scenarios are temporarily unavailable." },
        { status: 502 },
      );
    }

    const groqData: unknown = await groqRes.json();
    const parsed = parseGroqJson(groqData);

    return NextResponse.json({
      moves: normalizeMoves(parsed.moves),
    });
  } catch (error: unknown) {
    console.error("Competitor scenario generation failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to generate competitor scenarios." },
      { status: 500 },
    );
  }
}
