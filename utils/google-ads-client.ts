import { isJsonObject } from "@/lib/validation";

const GOOGLE_ADS_API_VERSION = "v25";
const GOOGLE_ADS_API_ORIGIN = "https://googleads.googleapis.com";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleAdsCredentials {
  customerId: string;
  developerToken: string;
  loginCustomerId?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
}

export interface LiveCampaignData {
  id: string;
  name: string;
  status: string;
  channelType: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversionsValue: number;
  roas: number;
}

export type GoogleAdsErrorCode =
  | "configuration_required"
  | "oauth_required"
  | "access_denied"
  | "google_ads_api_error"
  | "network_error";

export interface GoogleAdsApiResponse {
  success: boolean;
  configured: boolean;
  source: "live_api" | "unavailable";
  code?: GoogleAdsErrorCode;
  error?: string;
  requestId?: string;
  accountDetails?: {
    customerId: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
  };
  campaigns: LiveCampaignData[];
}

type GoogleAdsStreamRow = {
  campaign?: {
    id?: string | number;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
    advertising_channel_type?: string;
  };
  customer?: {
    descriptiveName?: string;
    descriptive_name?: string;
    currencyCode?: string;
    currency_code?: string;
    timeZone?: string;
    time_zone?: string;
  };
  metrics?: {
    costMicros?: string | number;
    cost_micros?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    ctr?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
    conversions_value?: string | number;
  };
};

function cleanCustomerId(customerId: string): string {
  return customerId.replaceAll("-", "").trim();
}

function errorMessage(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    const root = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!isJsonObject(root) || !isJsonObject(root.error)) return undefined;
    return typeof root.error.message === "string"
      ? root.error.message
      : undefined;
  } catch {
    return undefined;
  }
}

function stringOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

function finiteNumberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStreamRows(value: unknown): GoogleAdsStreamRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((batch) => {
    if (!isJsonObject(batch) || !Array.isArray(batch.results)) return [];

    return batch.results.flatMap((row) => {
      if (!isJsonObject(row)) return [];
      const campaignValue = isJsonObject(row.campaign) ? row.campaign : {};
      const customerValue = isJsonObject(row.customer) ? row.customer : {};
      const metricsValue = isJsonObject(row.metrics) ? row.metrics : {};

      return [
        {
          campaign: {
            id: stringOrNumber(campaignValue.id),
            name:
              typeof campaignValue.name === "string"
                ? campaignValue.name
                : undefined,
            status:
              typeof campaignValue.status === "string"
                ? campaignValue.status
                : undefined,
            advertisingChannelType:
              typeof campaignValue.advertisingChannelType === "string"
                ? campaignValue.advertisingChannelType
                : undefined,
            advertising_channel_type:
              typeof campaignValue.advertising_channel_type === "string"
                ? campaignValue.advertising_channel_type
                : undefined,
          },
          customer: {
            descriptiveName:
              typeof customerValue.descriptiveName === "string"
                ? customerValue.descriptiveName
                : undefined,
            descriptive_name:
              typeof customerValue.descriptive_name === "string"
                ? customerValue.descriptive_name
                : undefined,
            currencyCode:
              typeof customerValue.currencyCode === "string"
                ? customerValue.currencyCode
                : undefined,
            currency_code:
              typeof customerValue.currency_code === "string"
                ? customerValue.currency_code
                : undefined,
            timeZone:
              typeof customerValue.timeZone === "string"
                ? customerValue.timeZone
                : undefined,
            time_zone:
              typeof customerValue.time_zone === "string"
                ? customerValue.time_zone
                : undefined,
          },
          metrics: {
            costMicros: stringOrNumber(metricsValue.costMicros),
            cost_micros: stringOrNumber(metricsValue.cost_micros),
            impressions: stringOrNumber(metricsValue.impressions),
            clicks: stringOrNumber(metricsValue.clicks),
            ctr: stringOrNumber(metricsValue.ctr),
            conversions: stringOrNumber(metricsValue.conversions),
            conversionsValue: stringOrNumber(metricsValue.conversionsValue),
            conversions_value: stringOrNumber(metricsValue.conversions_value),
          },
        },
      ];
    });
  });
}

export async function refreshGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      errorMessage(body) ??
        `Google OAuth token refresh failed with status ${response.status}.`,
    );
  }

  const data: unknown = await response.json();
  if (
    !isJsonObject(data) ||
    typeof data.access_token !== "string" ||
    !data.access_token
  ) {
    throw new Error("Google OAuth token refresh returned no access token.");
  }

  return data.access_token;
}

function campaignFromRow(row: GoogleAdsStreamRow): LiveCampaignData {
  const campaign = row.campaign ?? {};
  const metrics = row.metrics ?? {};
  const costMicros = finiteNumberOrZero(
    metrics.costMicros ?? metrics.cost_micros,
  );
  const spend = Number((costMicros / 1_000_000).toFixed(2));
  const conversionsValue = Number(
    finiteNumberOrZero(
      metrics.conversionsValue ?? metrics.conversions_value,
    ).toFixed(2),
  );

  return {
    id: String(campaign.id ?? "unknown"),
    name: campaign.name || "Unnamed Campaign",
    status: campaign.status || "UNKNOWN",
    channelType:
      campaign.advertisingChannelType ??
      campaign.advertising_channel_type ??
      "UNKNOWN",
    spend,
    impressions: finiteNumberOrZero(metrics.impressions),
    clicks: finiteNumberOrZero(metrics.clicks),
    ctr: Number((finiteNumberOrZero(metrics.ctr) * 100).toFixed(2)),
    conversions: Number(finiteNumberOrZero(metrics.conversions).toFixed(1)),
    conversionsValue,
    roas:
      spend > 0 ? Number((conversionsValue / spend).toFixed(2)) : 0,
  };
}

export async function fetchLiveGoogleAdsData(
  credentials: GoogleAdsCredentials,
): Promise<GoogleAdsApiResponse> {
  const customerId = cleanCustomerId(credentials.customerId);
  const developerToken = credentials.developerToken.trim();

  if (!/^\d{10}$/.test(customerId) || !developerToken) {
    return {
      success: false,
      configured: false,
      source: "unavailable",
      code: "configuration_required",
      error: "Google Ads customer ID and developer token are required.",
      campaigns: [],
    };
  }

  let accessToken = credentials.accessToken?.trim();
  if (
    !accessToken &&
    credentials.clientId &&
    credentials.clientSecret &&
    credentials.refreshToken
  ) {
    try {
      accessToken = await refreshGoogleAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.refreshToken,
      );
    } catch (error: unknown) {
      console.error("Google OAuth token refresh failed.", {
        name: error instanceof Error ? error.name : "unknown",
      });
      return {
        success: false,
        configured: true,
        source: "unavailable",
        code: "oauth_required",
        error: "Google Ads authorization expired. Reconnect your account.",
        campaigns: [],
      };
    }
  }

  if (!accessToken) {
    return {
      success: false,
      configured: true,
      source: "unavailable",
      code: "oauth_required",
      error: "Connect Google Ads to authorize campaign access.",
      campaigns: [],
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
  };
  const loginCustomerId = cleanCustomerId(
    credentials.loginCustomerId ?? "",
  );
  if (loginCustomerId) {
    if (!/^\d{10}$/.test(loginCustomerId)) {
      return {
        success: false,
        configured: false,
        source: "unavailable",
        code: "configuration_required",
        error: "The Google Ads manager customer ID is invalid.",
        campaigns: [],
      };
    }
    headers["login-customer-id"] = loginCustomerId;
  }

  const query = `
    SELECT
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `.trim();

  try {
    const response = await fetch(
      `${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    );
    const requestId =
      response.headers.get("request-id") ??
      response.headers.get("google-ads-request-id") ??
      undefined;

    if (!response.ok) {
      await response.arrayBuffer();
      const code: GoogleAdsErrorCode =
        response.status === 401
          ? "oauth_required"
          : response.status === 403
            ? "access_denied"
            : "google_ads_api_error";
      console.error("Google Ads API request failed.", {
        status: response.status,
        requestId,
      });

      return {
        success: false,
        configured: true,
        source: "unavailable",
        code,
        error:
          code === "oauth_required"
            ? "Google Ads authorization expired. Reconnect your account."
            : code === "access_denied"
              ? "Google Ads denied access to this account."
              : "Google Ads is temporarily unavailable.",
        requestId,
        campaigns: [],
      };
    }

    const rows = parseStreamRows(await response.json());
    const customer = rows[0]?.customer;

    return {
      success: true,
      configured: true,
      source: "live_api",
      requestId,
      accountDetails: {
        customerId,
        descriptiveName:
          customer?.descriptiveName ?? customer?.descriptive_name,
        currencyCode: customer?.currencyCode ?? customer?.currency_code,
        timeZone: customer?.timeZone ?? customer?.time_zone,
      },
      campaigns: rows.map(campaignFromRow),
    };
  } catch (error: unknown) {
    console.error("Google Ads network request failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return {
      success: false,
      configured: true,
      source: "unavailable",
      code: "network_error",
      error: "Could not reach Google Ads.",
      campaigns: [],
    };
  }
}

export interface KeywordMetricsData {
  keyword: string;
  avgMonthlySearches: number;
  lowTopOfWeekBidMicros?: number;
  highTopOfWeekBidMicros?: number;
  cpcFormatted?: string;
}

export async function fetchKeywordMetrics(
  credentials: GoogleAdsCredentials,
  keywords: string[]
): Promise<Record<string, KeywordMetricsData>> {
  const customerId = cleanCustomerId(credentials.customerId);
  const developerToken = credentials.developerToken.trim();
  const accessToken = credentials.accessToken?.trim();

  if (
    !/^\d{10}$/.test(customerId) ||
    !developerToken ||
    !accessToken ||
    keywords.length === 0
  ) {
    return {};
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
  };
  if (credentials.loginCustomerId) {
    headers["login-customer-id"] = cleanCustomerId(credentials.loginCustomerId);
  }

  try {
    const url = `${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:generateKeywordHistoricalMetrics`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        keywords,
        keywordPlanNetwork: "GOOGLE_SEARCH",
        language: "languageConstants/1000",
        geoTargetConstants: ["geoTargetConstants/2840"],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return {};

    const data: unknown = await response.json();
    const results: Record<string, KeywordMetricsData> = {};
    if (isJsonObject(data) && Array.isArray(data.results)) {
      for (const res of data.results) {
        if (!isJsonObject(res)) continue;
        const text =
          typeof res.text === "string"
            ? res.text
            : typeof res.searchQuery === "string"
              ? res.searchQuery
              : undefined;
        const metrics = isJsonObject(res.keywordMetrics)
          ? res.keywordMetrics
          : {};
        const searches = Number(metrics.avgMonthlySearches ?? 0);
        const lowBid =
          Number(metrics.lowTopOfPageBidMicros ?? 0) / 1_000_000;
        const highBid =
          Number(metrics.highTopOfPageBidMicros ?? 0) / 1_000_000;
        const averageBid =
          lowBid > 0 || highBid > 0 ? (lowBid + highBid) / 2 : null;

        if (text) {
          results[text.toLowerCase()] = {
            keyword: text,
            avgMonthlySearches: Number.isFinite(searches) ? searches : 0,
            cpcFormatted:
              averageBid === null ? undefined : `$${averageBid.toFixed(2)}`,
          };
        }
      }
    }
    return results;
  } catch {
    return {};
  }
}
