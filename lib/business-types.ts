import { normalizeOptionalHttpUrl } from "@/lib/validation";

export type Business = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  value_proposition: string | null;
  competitors: string | null;
  markets: string | null;
  campaign_goal: string | null;
  price_range: string | null;
  target_keywords: string | null;
};

export type BusinessInput = {
  name: string;
  website?: string;
  industry?: string;
  description?: string;
  target_audience?: string;
  brand_voice?: string;
  value_proposition?: string;
  competitors?: string;
  markets?: string;
  campaign_goal?: string;
  price_range?: string;
  target_keywords?: string;
};

export const BUSINESS_SELECT =
  "id, name, website, industry, description, target_audience, brand_voice, value_proposition, competitors, markets, campaign_goal, price_range, target_keywords";

export const PRICE_RANGES = [
  "Budget (under $25)",
  "Mid-range ($25–$100)",
  "Premium ($100–$500)",
  "Luxury ($500+)",
] as const;

export const BRAND_TONES = [
  "Bold & direct",
  "Minimalist & premium",
  "Friendly & conversational",
  "Technical & authoritative",
  "Playful & energetic",
  "UGC & authentic",
] as const;

export const CAMPAIGN_GOALS = [
  "Brand awareness",
  "Traffic",
  "Lead generation",
  "Conversions / sales",
  "App installs",
  "Engagement",
] as const;

export const INDUSTRIES = [
  "E-commerce / Retail",
  "SaaS / Software",
  "Consumer apps",
  "Health & wellness",
  "Finance",
  "Education",
  "Food & beverage",
  "Fashion & beauty",
  "Travel",
  "B2B services",
  "Other",
] as const;

export function emptyBusinessInput(): BusinessInput {
  return {
    name: "",
    website: "",
    industry: "",
    description: "",
    target_audience: "",
    brand_voice: "",
    value_proposition: "",
    competitors: "",
    markets: "",
    campaign_goal: "",
    price_range: "",
    target_keywords: "",
  };
}

export function businessToInput(business: Business): BusinessInput {
  return {
    name: business.name,
    website: business.website ?? "",
    industry: business.industry ?? "",
    description: business.description ?? "",
    target_audience: business.target_audience ?? "",
    brand_voice: business.brand_voice ?? "",
    value_proposition: business.value_proposition ?? "",
    competitors: business.competitors ?? "",
    markets: business.markets ?? "",
    campaign_goal: business.campaign_goal ?? "",
    price_range: business.price_range ?? "",
    target_keywords: business.target_keywords ?? "",
  };
}

export function normalizeBusinessInput(input: BusinessInput) {
  const name = input.name.trim();
  if (!name) {
    return { error: "Business name is required" as const };
  }
  if (name.length > 160) {
    return { error: "Business name must be 160 characters or fewer" as const };
  }

  const website = normalizeOptionalHttpUrl(input.website);
  if (!website.success) return { error: website.error };

  const fields = [
    ["industry", input.industry, 120],
    ["description", input.description, 2_000],
    ["target audience", input.target_audience, 2_000],
    ["brand voice", input.brand_voice, 120],
    ["value proposition", input.value_proposition, 2_000],
    ["competitors", input.competitors, 2_000],
    ["markets", input.markets, 1_000],
    ["campaign goal", input.campaign_goal, 120],
    ["price range", input.price_range, 120],
    ["target keywords", input.target_keywords, 2_000],
  ] as const;
  const invalidField = fields.find(
    ([, value, maximum]) =>
      value !== undefined &&
      (value.length > maximum || /[\u0000]/.test(value)),
  );
  if (invalidField) {
    return {
      error: `${invalidField[0]} is too long or contains invalid characters`,
    };
  }

  return {
    data: {
      name,
      website: website.value,
      industry: input.industry?.trim() || null,
      description: input.description?.trim() || null,
      target_audience: input.target_audience?.trim() || null,
      brand_voice: input.brand_voice?.trim() || null,
      value_proposition: input.value_proposition?.trim() || null,
      competitors: input.competitors?.trim() || null,
      markets: input.markets?.trim() || null,
      campaign_goal: input.campaign_goal?.trim() || null,
      price_range: input.price_range?.trim() || null,
      target_keywords: input.target_keywords?.trim() || null,
    },
  };
}
