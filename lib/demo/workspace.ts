import type { BusinessInput } from "@/lib/business-types";
import type { Business } from "@/lib/business-types";
import type { Product } from "@/lib/product-types";
import type { CompetitorItem } from "@/app/dashboard/competitor-actions";
import {
  DEMO_BUSINESS_ID,
  demoBrainScore,
  demoCampaigns,
  demoCompetitorRun,
  demoCompetitorSettings,
  demoCompetitors,
  demoGoogleAdsAccount,
  demoKeywords,
  demoProducts,
} from "@/lib/demo/fixtures";
import { alibabaDemoProfile } from "@/lib/demo/alibaba-profile";
import type { KeywordRecommendation } from "@/lib/keyword-intelligence/types";
import type {
  MonitorSettingsDto,
  ResearchCandidateDto,
  ResearchRunDto,
} from "@/lib/competitor-intelligence/types";
import type { ScoreResponse } from "@/lib/dopa-api";
import type { LiveCampaignData } from "@/utils/google-ads-client";

export const DEMO_WORKSPACE_KEY = "dopa.demo.workspace.v1";

export type DemoOnboardingDraft = {
  form: BusinessInput;
  competitorsInput: string;
  firstProduct: {
    product_name: string;
    value_prop: string;
    price: string;
    creative_hook: string;
  };
};

export type DemoWorkspace = {
  businesses: Business[];
  products: Product[];
  competitors: CompetitorItem[];
  competitorRun: ResearchRunDto;
  competitorSettings: MonitorSettingsDto;
  keywords: KeywordRecommendation[];
  campaigns: LiveCampaignData[];
  googleAdsAccount: typeof demoGoogleAdsAccount;
  brainScore: ScoreResponse;
};

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function brandBlob(form: BusinessInput): string {
  return [form.name, form.website, form.industry, form.description, form.value_proposition]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isNorthstarFixture(form: BusinessInput): boolean {
  const name = (form.name ?? "").trim().toLowerCase();
  const website = (form.website ?? "").trim().toLowerCase();
  return (
    name.includes("northstar") ||
    website.includes("northstar.example")
  );
}

function isApparelBrand(form: BusinessInput): boolean {
  if (isNorthstarFixture(form)) return true;
  const blob = brandBlob(form);
  return (
    /\b(fashion|apparel|clothing|beauty|wear|tee|garment|streetwear)\b/.test(
      blob,
    ) || (form.industry ?? "").toLowerCase().includes("fashion")
  );
}

function isAlibabaOrB2b(form: BusinessInput): boolean {
  const blob = brandBlob(form);
  return (
    blob.includes("alibaba") ||
    /\bb2b\b/.test(blob) ||
    blob.includes("wholesale") ||
    blob.includes("sourcing") ||
    blob.includes("marketplace") ||
    (form.industry ?? "").toLowerCase().includes("b2b")
  );
}

function productCategoryFor(form: BusinessInput): string {
  if (isApparelBrand(form)) return "Apparel";
  if (isAlibabaOrB2b(form)) return "Services";
  if ((form.industry ?? "").toLowerCase().includes("software")) {
    return "Software / SaaS";
  }
  return "Other";
}

function makeProduct(
  idSuffix: string,
  input: {
    product_name: string;
    value_prop: string;
    price: string;
    creative_hook?: string;
    category?: string;
    key_features?: string[];
    target_sub_demographic?: string | null;
  },
): Product {
  const priceNum = parsePrice(input.price);
  const priceLabel =
    priceNum == null && input.price.trim() ? input.price.trim() : null;
  return {
    id: `22222222-2222-4222-8222-22222222222${idSuffix}`,
    business_id: DEMO_BUSINESS_ID,
    product_name: input.product_name,
    category: input.category ?? "Other",
    price: priceNum,
    price_label: priceLabel,
    value_prop: input.value_prop.trim() || null,
    target_sub_demographic: input.target_sub_demographic ?? null,
    key_features: input.key_features ?? [],
    creative_hooks: input.creative_hook?.trim()
      ? [input.creative_hook.trim()]
      : [],
  };
}

function buildAlibabaSampleProducts(form: BusinessInput): Product[] {
  const audience = form.target_audience?.trim() || null;
  const first = alibabaDemoProfile.first_product;
  const extras = alibabaDemoProfile.extra_products;
  return [
    makeProduct("9", {
      product_name: first.product_name,
      value_prop: first.value_prop,
      price: first.price,
      creative_hook: first.creative_hook,
      category: "Software / SaaS",
      key_features: [
        "AI supplier research",
        "RFQ drafting",
        "Sourcing shortlists",
      ],
      target_sub_demographic: audience,
    }),
    ...extras.map((p, i) =>
      makeProduct(String(8 - i), {
        product_name: p.product_name,
        value_prop: p.value_prop,
        price: p.price,
        creative_hook: p.creative_hook,
        category: p.category,
        key_features: [...p.key_features],
        target_sub_demographic: audience,
      }),
    ),
  ];
}

function buildGenericBrandProducts(form: BusinessInput): Product[] {
  const name = form.name.trim() || "Demo brand";
  const value =
    form.value_proposition?.trim() ||
    form.description?.trim() ||
    `${name} core offer for ${form.target_audience?.trim() || "your buyers"}.`;
  const industry = form.industry?.trim() || "Services";
  const category = productCategoryFor(form);
  const audience = form.target_audience?.trim() || null;

  return [
    makeProduct("9", {
      product_name: `${name} Core Offer`,
      value_prop: value,
      price: form.price_range?.trim() || "Contact sales",
      creative_hook: `Why teams choose ${name}`,
      category,
      key_features: [industry, form.campaign_goal?.trim() || "Growth"].filter(
        Boolean,
      ),
      target_sub_demographic: audience,
    }),
    makeProduct("8", {
      product_name: `${name} Starter Plan`,
      value_prop: `Get started with ${name} — ${value}`,
      price: "Free trial",
      creative_hook: "Low-friction first conversion",
      category,
      target_sub_demographic: audience,
    }),
    makeProduct("7", {
      product_name: `${name} Pro`,
      value_prop: `Scale with ${name} for ${form.target_audience?.trim() || "growing teams"}.`,
      price: form.price_range?.trim() || "Custom",
      creative_hook: "Upgrade path for serious buyers",
      category,
      target_sub_demographic: audience,
    }),
  ];
}

function buildProducts(
  draft: DemoOnboardingDraft,
  business: Business,
): Product[] {
  const form = draft.form;
  const onboardingName = draft.firstProduct.product_name.trim();
  const category = productCategoryFor(form);
  const apparel = isApparelBrand(form);
  const alibaba = isAlibabaOrB2b(form);

  if (onboardingName) {
    const primary = makeProduct("9", {
      product_name: onboardingName,
      value_prop: draft.firstProduct.value_prop,
      price: draft.firstProduct.price,
      creative_hook: draft.firstProduct.creative_hook,
      category,
      target_sub_demographic: business.target_audience,
    });

    if (apparel) {
      const extras = demoProducts
        .filter(
          (p) =>
            p.product_name.toLowerCase() !== onboardingName.toLowerCase(),
        )
        .slice(0, 2)
        .map((p) => ({
          ...p,
          business_id: DEMO_BUSINESS_ID,
        }));
      return [primary, ...extras];
    }

    if (alibaba) {
      const extras = alibabaDemoProfile.extra_products
        .filter(
          (p) =>
            p.product_name.toLowerCase() !== onboardingName.toLowerCase(),
        )
        .slice(0, 2)
        .map((p, i) =>
          makeProduct(String(8 - i), {
            product_name: p.product_name,
            value_prop: p.value_prop,
            price: p.price,
            creative_hook: p.creative_hook,
            category: p.category,
            key_features: [...p.key_features],
            target_sub_demographic: business.target_audience,
          }),
        );
      return [primary, ...extras];
    }

    // Non-apparel, non-Alibaba: first product only + one brand-matched companion
    const companion = makeProduct("8", {
      product_name: `${business.name} Companion Offer`,
      value_prop:
        business.value_proposition?.trim() ||
        `Pair with ${onboardingName} for ${business.target_audience ?? "buyers"}.`,
      price: form.price_range?.trim() || "Contact sales",
      creative_hook: `Built for ${business.name} buyers`,
      category,
      target_sub_demographic: business.target_audience,
    });
    return [primary, companion];
  }

  // No first product from onboarding
  if (apparel) {
    return demoProducts.map((p) => ({ ...p, business_id: DEMO_BUSINESS_ID }));
  }
  if (alibaba) {
    return buildAlibabaSampleProducts(form);
  }
  return buildGenericBrandProducts(form);
}

function alibabaKeywords(): KeywordRecommendation[] {
  return [
    {
      keyword: "B2B wholesale marketplace",
      current_keyword: null,
      status: "add",
      category: "commercial",
      intent: "Buyers comparing global wholesale platforms.",
      feedback: "Broad category phrase with the most buyer demand here.",
      suggested_ad_headline: "Source Verified Manufacturers",
      confidence: 68,
      rank: 1,
      evidence: [],
    },
    {
      keyword: "AI sourcing agent",
      current_keyword: null,
      status: "add",
      category: "commercial",
      intent: "Importers looking for AI-assisted supplier research.",
      feedback: "Positions AI sourcing against manual supplier research.",
      suggested_ad_headline: "Accio AI Sourcing Agent",
      confidence: 65,
      rank: 2,
      evidence: [],
    },
    {
      keyword: "Trade Assurance Alibaba",
      current_keyword: null,
      status: "add",
      category: "commercial",
      intent: "Buyers seeking order protection on wholesale deals.",
      feedback: "Branded protection term that reassures new buyers.",
      suggested_ad_headline: "Orders Protected End to End",
      confidence: 62,
      rank: 3,
      evidence: [],
    },
    {
      keyword: "verified manufacturers China",
      current_keyword: null,
      status: "add",
      category: "long_tail",
      intent: "Wholesale buyers filtering for audited factories.",
      feedback: "Long-tail phrase from buyers vetting factories.",
      suggested_ad_headline: "Verified Suppliers, Ready to Ship",
      confidence: 58,
      rank: 4,
      evidence: [],
    },
    {
      keyword: "Amazon Business alternative",
      current_keyword: null,
      status: "add",
      category: "competitor",
      intent: "Buyers comparing wholesale marketplaces.",
      feedback: "Captures rising comparison searches against Amazon Business.",
      suggested_ad_headline: "Factory-Direct Beyond Office Supplies",
      confidence: 55,
      rank: 5,
      evidence: [],
    },
  ];
}

function brandMatchedKeywords(business: Business): KeywordRecommendation[] {
  const name = business.name;
  const productHint =
    business.value_proposition?.split(/[.—]/)[0]?.trim() || name;
  return [
    {
      keyword: `${name} pricing`.toLowerCase(),
      current_keyword: null,
      status: "add",
      category: "commercial",
      intent: `High-intent evaluators researching ${name}.`,
      feedback: "Branded pricing searches come from buyers near a decision.",
      suggested_ad_headline: `${name} · Get Started`,
      confidence: 60,
      rank: 1,
      evidence: [],
    },
    {
      keyword: `${productHint}`.toLowerCase().slice(0, 60),
      current_keyword: null,
      status: "add",
      category: "commercial",
      intent: "Buyers matching the brand value proposition.",
      feedback: "Turns the brand value proposition into a search phrase.",
      suggested_ad_headline: productHint.slice(0, 40),
      confidence: 56,
      rank: 2,
      evidence: [],
    },
    {
      keyword: `${business.industry ?? "B2B"} software`.toLowerCase(),
      current_keyword: null,
      status: "add",
      category: "long_tail",
      intent: "Category browsers in the brand's industry.",
      feedback: "Category phrase for buyers browsing this industry.",
      suggested_ad_headline: `Built for ${business.industry ?? "your market"}`,
      confidence: 52,
      rank: 3,
      evidence: [],
    },
  ];
}

function buildCompetitorCandidates(
  names: string[],
  business: Business,
  alibaba: boolean,
): ResearchCandidateDto[] {
  const fallbackWhy = alibaba
    ? `Competes for wholesale buyers and importers alongside ${business.name}.`
    : `Competes with ${business.name} in ${business.industry ?? "this market"}.`;

  return names.slice(0, 3).map((name, index) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || `competitor${index}`;
    const domain = `${slug}.com`;
    return {
      id: `cand-demo-${index}`,
      name,
      website_url: `https://${domain}`,
      normalized_domain: domain,
      relationship:
        index === 0 ? ("direct" as const) : index === 1 ? ("direct" as const) : ("emerging" as const),
      threat_score: Math.max(40, 88 - index * 12),
      confidence: Math.max(50, 90 - index * 8),
      threat_horizon:
        index === 0
          ? ("now" as const)
          : index === 1
            ? ("next_6_months" as const)
            : ("next_12_months" as const),
      why_competitor: fallbackWhy,
      why_now: `Tracked from ${business.name} onboarding.`,
      rank: index + 1,
      customer_overlap: Math.max(40, 85 - index * 15),
      product_substitutability: Math.max(35, 80 - index * 14),
      momentum: Math.max(40, 88 - index * 10),
      distribution_overlap: Math.max(30, 70 - index * 12),
      evidence_quality: Math.max(40, 80 - index * 10),
      evidence: [],
    };
  });
}

export function buildDemoWorkspace(draft: DemoOnboardingDraft): DemoWorkspace {
  const business: Business = {
    id: DEMO_BUSINESS_ID,
    name: draft.form.name.trim() || "Demo brand",
    website: draft.form.website?.trim() || null,
    industry: draft.form.industry?.trim() || null,
    description: draft.form.description?.trim() || null,
    target_audience: draft.form.target_audience?.trim() || null,
    brand_voice: draft.form.brand_voice?.trim() || null,
    value_proposition: draft.form.value_proposition?.trim() || null,
    competitors:
      draft.competitorsInput.trim() || draft.form.competitors?.trim() || null,
    markets: draft.form.markets?.trim() || null,
    campaign_goal: draft.form.campaign_goal?.trim() || null,
    price_range: draft.form.price_range?.trim() || null,
    target_keywords: draft.form.target_keywords?.trim() || null,
  };

  const apparel = isApparelBrand(draft.form);
  const alibaba = isAlibabaOrB2b(draft.form);
  const products = buildProducts(draft, business);

  const competitorNames = draft.competitorsInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  const resolvedCompetitorNames =
    competitorNames.length > 0
      ? competitorNames
      : alibaba
        ? [...alibabaDemoProfile.competitors]
        : apparel
          ? demoCompetitors.map((c) => c.name)
          : [];

  const competitors: CompetitorItem[] =
    resolvedCompetitorNames.length > 0
      ? resolvedCompetitorNames.map((name, index) => ({
          id: `44444444-4444-4444-8444-44444444444${index}`,
          business_id: DEMO_BUSINESS_ID,
          name,
          website_url: null,
          logo_url: null,
          primary_angle: alibaba
            ? "B2B marketplace / wholesale acquisition"
            : apparel
              ? "Discovered during brand intake"
              : "Discovered during brand intake",
          candidate_id: `cand-demo-${index}`,
          normalized_domain: null,
          relationship: index === 0 ? "direct" : "indirect",
          threat_score: Math.max(40, 88 - index * 12),
          confidence: Math.max(50, 90 - index * 8),
          threat_horizon: index === 0 ? "now" : "next_6_months",
          why_now: `Tracked from ${business.name} onboarding.`,
          status: "active",
          created_at: new Date().toISOString(),
        }))
      : demoCompetitors.map((c) => ({ ...c, business_id: DEMO_BUSINESS_ID }));

  const competitorRun: ResearchRunDto = {
    ...demoCompetitorRun,
    business_id: DEMO_BUSINESS_ID,
    candidates:
      resolvedCompetitorNames.length > 0
        ? buildCompetitorCandidates(
            resolvedCompetitorNames,
            business,
            alibaba,
          )
        : demoCompetitorRun.candidates,
  };

  const keywords = alibaba
    ? alibabaKeywords()
    : apparel
      ? demoKeywords
      : brandMatchedKeywords(business);

  const googleAdsAccount = alibaba
    ? {
        ...demoGoogleAdsAccount,
        descriptiveName: business.name,
      }
    : apparel
      ? demoGoogleAdsAccount
      : {
          ...demoGoogleAdsAccount,
          descriptiveName: business.name,
        };

  const campaigns = alibaba
    ? [
        {
          id: "camp-ali-1",
          name: "Accio · Prospecting",
          status: "ENABLED" as const,
          channelType: "SEARCH",
          spend: 12400,
          impressions: 980_000,
          clicks: 28_420,
          ctr: 2.9,
          conversions: 412,
          conversionsValue: 0,
          roas: 0,
        },
        {
          id: "camp-ali-2",
          name: "Trade Assurance · Search",
          status: "ENABLED" as const,
          channelType: "SEARCH",
          spend: 8600,
          impressions: 720_000,
          clicks: 19_440,
          ctr: 2.7,
          conversions: 268,
          conversionsValue: 0,
          roas: 0,
        },
        {
          id: "camp-ali-3",
          name: "Verified Suppliers · Retarget",
          status: "PAUSED" as const,
          channelType: "DISPLAY",
          spend: 2100,
          impressions: 410_000,
          clicks: 5_330,
          ctr: 1.3,
          conversions: 48,
          conversionsValue: 0,
          roas: 0,
        },
      ]
    : demoCampaigns;

  return {
    businesses: [business],
    products,
    competitors,
    competitorRun,
    competitorSettings: {
      ...demoCompetitorSettings,
      business_id: DEMO_BUSINESS_ID,
    },
    keywords,
    campaigns,
    googleAdsAccount,
    brainScore: demoBrainScore,
  };
}

export function saveDemoWorkspace(draft: DemoOnboardingDraft) {
  if (typeof window === "undefined") return;
  const workspace = buildDemoWorkspace(draft);
  sessionStorage.setItem(DEMO_WORKSPACE_KEY, JSON.stringify(workspace));
}

export function loadDemoWorkspace(): DemoWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEMO_WORKSPACE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoWorkspace;
  } catch {
    return null;
  }
}

export function defaultDemoWorkspace(): DemoWorkspace {
  return buildDemoWorkspace({
    form: {
      name: "Northstar Apparel",
      website: "https://northstar.example",
      industry: "Fashion & beauty",
      target_audience:
        "25–40 urban professionals who buy elevated basics and respond to founder-led UGC.",
      brand_voice: "Minimalist & premium",
      value_proposition: "Premium everyday apparel without the luxury markup.",
      campaign_goal: "Conversions / sales",
      price_range: "Mid-range ($25–$100)",
    },
    competitorsInput: "Rival Labs, Atlas Wear, Cove Supply",
    firstProduct: {
      product_name: "Summit Tee",
      value_prop: "Heavyweight cotton · boxy fit",
      price: "58",
      creative_hook: "Fabric close-up",
    },
  });
}
