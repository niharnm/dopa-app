import type { CompetitorItem } from "@/app/dashboard/competitor-actions";
import type { Business } from "@/lib/business-types";
import type {
  MonitorSettingsDto,
  ResearchCandidateDto,
  ResearchRunDto,
} from "@/lib/competitor-intelligence/types";
import type { ScoreResponse } from "@/lib/dopa-api";
import type { KeywordRecommendation } from "@/lib/keyword-intelligence/types";
import type { Product } from "@/lib/product-types";
import { buildTimelineCurve } from "@/lib/timeline-curve";
import type { LiveCampaignData } from "@/utils/google-ads-client";

export const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

export const DEMO_SIGNUP_HREF = "/?modal=signup&redirectTo=%2Fdashboard";

export const demoBusinesses: Business[] = [
  {
    id: DEMO_BUSINESS_ID,
    name: "Northstar Apparel",
    website: "https://northstar.example",
    industry: "Fashion & beauty",
    description:
      "DTC elevated basics for urban professionals — heavyweight cotton, boxy fits, founder-led UGC.",
    target_audience:
      "25–40 urban professionals who buy elevated basics and respond to founder-led UGC.",
    brand_voice: "Minimalist & premium",
    value_proposition: "Premium everyday apparel without the luxury markup.",
    competitors: "Rival Labs, Atlas Wear, Cove Supply",
    markets: "US, CA",
    campaign_goal: "Conversions / sales",
    price_range: "Mid-range ($25–$100)",
    target_keywords: "heavyweight tee, boxy fit, organic cotton basics",
  },
];

export const demoProducts: Product[] = [
  {
    id: "22222222-2222-4222-8222-222222222221",
    business_id: DEMO_BUSINESS_ID,
    product_name: "Summit Tee",
    category: "Apparel",
    price: 58,
    price_label: null,
    value_prop: "Heavyweight cotton · boxy fit",
    target_sub_demographic: "Urban professionals 25–40",
    key_features: ["14oz cotton", "Boxy cut", "Garment dyed"],
    creative_hooks: ["Fabric close-up", "Fit flip", "Street cutaway"],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    business_id: DEMO_BUSINESS_ID,
    product_name: "Trail Overshirt",
    category: "Apparel",
    price: 128,
    price_label: null,
    value_prop: "Waxed canvas · seasonless layer",
    target_sub_demographic: "Outdoor-leaning city wearers",
    key_features: ["Waxed canvas", "Hidden pockets", "Seasonless"],
    creative_hooks: ["Weather test", "Layer stack", "Detail macro"],
  },
  {
    id: "22222222-2222-4222-8222-222222222223",
    business_id: DEMO_BUSINESS_ID,
    product_name: "Core Sock 3-Pack",
    category: "Apparel",
    price: 32,
    price_label: null,
    value_prop: "Merino blend · everyday rotation",
    target_sub_demographic: "Everyday essentials buyers",
    key_features: ["Merino blend", "Reinforced heel", "3-pack"],
    creative_hooks: ["Unpack ASMR", "Color grid", "Wear day 7"],
  },
];

function evidence(
  id: string,
  title: string,
  url: string,
): ResearchCandidateDto["evidence"][number] {
  return {
    id,
    source_url: url,
    source_domain: new URL(url).hostname,
    title,
    source_type: "news",
    claim: title,
    excerpt: title,
    published_at: "2026-07-01T00:00:00.000Z",
    observed_at: "2026-07-20T00:00:00.000Z",
    content_hash: id,
  };
}

const demoCandidates: ResearchCandidateDto[] = [
  {
    id: "cand-rival",
    name: "Rival Labs",
    website_url: "https://rivallabs.com",
    normalized_domain: "rivallabs.com",
    relationship: "direct",
    threat_score: 86,
    confidence: 92,
    threat_horizon: "now",
    why_competitor: "Same DTC apparel buyer · aggressive paid social.",
    why_now: "Price-slash montage with soft CTA is outperforming category CPMs.",
    rank: 1,
    customer_overlap: 88,
    product_substitutability: 82,
    momentum: 90,
    distribution_overlap: 75,
    evidence_quality: 84,
    evidence: [
      evidence(
        "ev-1",
        "Rival Labs summer discount flight",
        "https://rivallabs.com/summer",
      ),
    ],
  },
  {
    id: "cand-atlas",
    name: "Atlas Wear",
    website_url: "https://atlaswear.co",
    normalized_domain: "atlaswear.co",
    relationship: "direct",
    threat_score: 71,
    confidence: 78,
    threat_horizon: "next_6_months",
    why_competitor: "Founder-led unbox hooks in the same creative lane.",
    why_now: "6s punch-in format gaining share of voice on Meta.",
    rank: 2,
    customer_overlap: 70,
    product_substitutability: 68,
    momentum: 74,
    distribution_overlap: 60,
    evidence_quality: 72,
    evidence: [
      evidence(
        "ev-2",
        "Atlas Wear founder unbox series",
        "https://atlaswear.co/journal",
      ),
    ],
  },
  {
    id: "cand-cove",
    name: "Cove Supply",
    website_url: "https://covesupply.com",
    normalized_domain: "covesupply.com",
    relationship: "emerging",
    threat_score: 58,
    confidence: 64,
    threat_horizon: "next_12_months",
    why_competitor: "Lifestyle montage brand adjacent to elevated basics.",
    why_now: "Muted VO tests could expand into Northstar's lookalike pools.",
    rank: 3,
    customer_overlap: 55,
    product_substitutability: 48,
    momentum: 62,
    distribution_overlap: 40,
    evidence_quality: 58,
    evidence: [
      evidence(
        "ev-3",
        "Cove Supply lifestyle campaign",
        "https://covesupply.com/campaign",
      ),
    ],
  },
];

export const demoCompetitorRun: ResearchRunDto = {
  id: "33333333-3333-4333-8333-333333333333",
  business_id: DEMO_BUSINESS_ID,
  trigger: "manual",
  status: "completed",
  stage: "completed",
  model_id: "demo-qwen",
  source_count: 18,
  error_code: null,
  error_message: null,
  queued_at: "2026-07-28T10:00:00.000Z",
  started_at: "2026-07-28T10:00:02.000Z",
  completed_at: "2026-07-28T10:01:12.000Z",
  queue_position: null,
  candidates: demoCandidates,
};

export const demoCompetitors: CompetitorItem[] = [
  {
    id: "44444444-4444-4444-8444-444444444441",
    business_id: DEMO_BUSINESS_ID,
    name: "Rival Labs",
    website_url: "https://rivallabs.com",
    logo_url: null,
    primary_angle: "Price-slash montage · soft CTA",
    candidate_id: "cand-rival",
    normalized_domain: "rivallabs.com",
    relationship: "direct",
    threat_score: 86,
    confidence: 92,
    threat_horizon: "now",
    why_now: "Discount flight outperforming category CPMs.",
    status: "active",
    created_at: "2026-07-20T00:00:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444442",
    business_id: DEMO_BUSINESS_ID,
    name: "Atlas Wear",
    website_url: "https://atlaswear.co",
    logo_url: null,
    primary_angle: "Founder unbox · 6s punch-in",
    candidate_id: "cand-atlas",
    normalized_domain: "atlaswear.co",
    relationship: "direct",
    threat_score: 71,
    confidence: 78,
    threat_horizon: "next_6_months",
    why_now: "Punch-in format gaining Meta share of voice.",
    status: "active",
    created_at: "2026-07-21T00:00:00.000Z",
  },
];

export const demoCompetitorSettings: MonitorSettingsDto = {
  business_id: DEMO_BUSINESS_ID,
  enabled: true,
  cadence: "daily",
  local_time: "09:00:00",
  timezone: "America/Los_Angeles",
  min_alert_score: 70,
  notify_in_app: true,
  next_run_at: "2026-07-30T16:00:00.000Z",
};

export const demoKeywords: KeywordRecommendation[] = [
  {
    keyword: "heavyweight tee men",
    current_keyword: "heavyweight tee",
    status: "improve",
    category: "commercial",
    intent: "High-intent shoppers comparing premium basics.",
    feedback: "Adding the audience qualifier matches how buyers search.",
    suggested_ad_headline: "Heavyweight Tee, Built to Last",
    confidence: 68,
    rank: 1,
    evidence: [],
  },
  {
    keyword: "boxy fit t-shirt",
    current_keyword: "boxy fit",
    status: "improve",
    category: "commercial",
    intent: "Style-led buyers seeking modern silhouette.",
    feedback: "Naming the product type filters out non-apparel searches.",
    suggested_ad_headline: "Boxy Fit That Actually Fits",
    confidence: 64,
    rank: 2,
    evidence: [],
  },
  {
    keyword: "organic cotton basics",
    current_keyword: "organic cotton basics",
    status: "keep",
    category: "long_tail",
    intent: "Values-led shoppers filtering for materials.",
    feedback: "Already specific to the material buyers filter for.",
    suggested_ad_headline: "Organic Cotton, Everyday Soft",
    confidence: 62,
    rank: 3,
    evidence: [],
  },
  {
    keyword: "premium everyday tee",
    current_keyword: null,
    status: "add",
    category: "commercial",
    intent: "Quality-over-quantity apparel buyers.",
    feedback: "Mirrors the premium everyday positioning in the profile.",
    suggested_ad_headline: "Premium Tee Without the Markup",
    confidence: 58,
    rank: 4,
    evidence: [],
  },
  {
    keyword: "rival labs alternative",
    current_keyword: null,
    status: "add",
    category: "competitor",
    intent: "Shoppers comparing against Rival Labs.",
    feedback: "Captures rising comparison searches against Rival Labs.",
    suggested_ad_headline: "Skip the Soft CTA. Feel the Fabric.",
    confidence: 55,
    rank: 5,
    evidence: [],
  },
];

export const demoCampaigns: LiveCampaignData[] = [
  {
    id: "camp-1",
    name: "Summer Drop · Prospecting",
    status: "ENABLED",
    channelType: "PERFORMANCE_MAX",
    spend: 8420,
    impressions: 1_240_000,
    clicks: 32_360,
    ctr: 2.61,
    conversions: 284,
    conversionsValue: 27_100,
    roas: 3.22,
  },
  {
    id: "camp-2",
    name: "Summit Tee · Search",
    status: "ENABLED",
    channelType: "SEARCH",
    spend: 3180,
    impressions: 420_000,
    clicks: 11_760,
    ctr: 2.8,
    conversions: 96,
    conversionsValue: 9_400,
    roas: 2.96,
  },
  {
    id: "camp-3",
    name: "Soft CTA · Retarget",
    status: "PAUSED",
    channelType: "DISPLAY",
    spend: 820,
    impressions: 310_000,
    clicks: 4_030,
    ctr: 1.3,
    conversions: 12,
    conversionsValue: 980,
    roas: 1.2,
  },
];

export const demoGoogleAdsAccount = {
  customerId: "123-456-7890",
  descriptiveName: "Northstar Apparel",
  currencyCode: "USD",
  timeZone: "America/Los_Angeles",
};

const brainDuration = 12;

export const demoBrainScore: ScoreResponse = {
  metric: "predicted_average_ctr",
  score_percent: 2.84,
  raw_mean_ictr: 0.0284,
  processing_seconds: 18.2,
  model_load_seconds: 2.1,
  peak_vram_mib: 6120,
  model_version: "dopa-model/demo",
  brain_response: {
    status: "unavailable",
    model_path: null,
    expires_at: null,
    duration_seconds: brainDuration,
    hemodynamic_lag_seconds: 4.2,
    top_regions: [
      {
        region_id: "V1",
        name: "V1 early visual",
        hemisphere: "left",
        relative_response: 0.86,
        peak_second: 7.2,
        description: "Strong early visual response at product reveal.",
      },
      {
        region_id: "FFA",
        name: "FFA face / form",
        hemisphere: "right",
        relative_response: 0.72,
        peak_second: 4.8,
        description: "Form-selective response during fabric close-up.",
      },
      {
        region_id: "MT",
        name: "MT motion",
        hemisphere: "left",
        relative_response: 0.64,
        peak_second: 2.1,
        description: "Motion onset at hook.",
      },
      {
        region_id: "PPA",
        name: "PPA place",
        hemisphere: "right",
        relative_response: 0.41,
        peak_second: 9.5,
        description: "Mild place response on street cutaway.",
      },
    ],
  },
  timeline_curve: buildTimelineCurve({
    durationSeconds: brainDuration,
    attentionScore: 72,
    loadScore: 48,
  }),
};

export const DEMO_CTA_MESSAGE =
  "This is a live demo of the real dashboard. Sign up to save, connect Ads, or run TRIBE on your creatives.";
