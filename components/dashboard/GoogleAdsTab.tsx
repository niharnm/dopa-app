"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type {
  GoogleAdsApiResponse,
  GoogleAdsErrorCode,
  LiveCampaignData,
} from "@/utils/google-ads-client";
import { isJsonObject } from "@/lib/validation";
import { GoogleAdsOnboarding } from "./GoogleAdsOnboarding";

type ConnectionState =
  | "loading"
  | "connected"
  | "oauth_required"
  | "configuration_required"
  | "error";

type CampaignFilter =
  | "All"
  | "Performance Max"
  | "YouTube"
  | "Search"
  | "Display";

const filters: CampaignFilter[] = [
  "All",
  "Performance Max",
  "YouTube",
  "Search",
  "Display",
];

function matchesFilter(
  campaign: LiveCampaignData,
  filter: CampaignFilter,
): boolean {
  if (filter === "All") return true;
  const channel = campaign.channelType.toUpperCase();
  if (filter === "Performance Max") return channel === "PERFORMANCE_MAX";
  if (filter === "YouTube") return channel.includes("VIDEO");
  return channel.includes(filter.toUpperCase());
}

function humanizeChannel(channel: string): string {
  return channel
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function connectionStateFor(
  code: GoogleAdsErrorCode | undefined,
): ConnectionState {
  if (code === "configuration_required") return "configuration_required";
  if (code === "oauth_required") return "oauth_required";
  return "error";
}

function oauthNotice(result: string | undefined): string | null {
  if (result === "connected") {
    return "Google sign-in completed. Campaign access is checked separately.";
  }
  if (result === "connected_temporary") {
    return "Google sign-in completed with temporary access. You may need to sign in again after this session expires.";
  }
  if (result === "configuration_required") {
    return "Google authorization succeeded, but secure token storage is not configured correctly.";
  }
  if (result === "oauth_error") {
    return "Google sign-in succeeded, but Google did not return an Ads access token. Reconnect and approve the requested access.";
  }
  return null;
}

function isGoogleAdsErrorCode(value: unknown): value is GoogleAdsErrorCode {
  return (
    value === "configuration_required" ||
    value === "oauth_required" ||
    value === "access_denied" ||
    value === "google_ads_api_error" ||
    value === "network_error"
  );
}

function retryLabel(
  code: GoogleAdsErrorCode | undefined,
  detailed = false,
): string {
  if (code === "configuration_required") return "Check configuration";
  if (code === "network_error" || code === "google_ads_api_error") {
    return "Try again";
  }
  if (code === "access_denied" && detailed) {
    return "I finished setup — check access";
  }
  return "Check access";
}

function isLiveCampaignData(value: unknown): value is LiveCampaignData {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.status === "string" &&
    typeof value.channelType === "string" &&
    typeof value.spend === "number" &&
    Number.isFinite(value.spend) &&
    typeof value.impressions === "number" &&
    Number.isFinite(value.impressions) &&
    typeof value.clicks === "number" &&
    Number.isFinite(value.clicks) &&
    typeof value.ctr === "number" &&
    Number.isFinite(value.ctr) &&
    typeof value.conversions === "number" &&
    Number.isFinite(value.conversions) &&
    typeof value.conversionsValue === "number" &&
    Number.isFinite(value.conversionsValue) &&
    typeof value.roas === "number" &&
    Number.isFinite(value.roas)
  );
}

function parseGoogleAdsResponse(value: unknown): GoogleAdsApiResponse {
  if (
    !isJsonObject(value) ||
    typeof value.success !== "boolean" ||
    typeof value.configured !== "boolean" ||
    (value.source !== "live_api" && value.source !== "unavailable") ||
    !Array.isArray(value.campaigns)
  ) {
    throw new Error("Google Ads returned an invalid response.");
  }

  const campaigns = value.campaigns.filter(isLiveCampaignData);
  if (campaigns.length !== value.campaigns.length) {
    throw new Error("Google Ads returned invalid campaign data.");
  }

  const accountValue = isJsonObject(value.accountDetails)
    ? value.accountDetails
    : null;
  const accountDetails =
    accountValue && typeof accountValue.customerId === "string"
      ? {
          customerId: accountValue.customerId,
          descriptiveName:
            typeof accountValue.descriptiveName === "string"
              ? accountValue.descriptiveName
              : undefined,
          currencyCode:
            typeof accountValue.currencyCode === "string"
              ? accountValue.currencyCode
              : undefined,
          timeZone:
            typeof accountValue.timeZone === "string"
              ? accountValue.timeZone
              : undefined,
        }
      : undefined;

  return {
    success: value.success,
    configured: value.configured,
    source: value.source,
    code: isGoogleAdsErrorCode(value.code) ? value.code : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
    requestId:
      typeof value.requestId === "string" ? value.requestId : undefined,
    accountDetails,
    campaigns,
  };
}

export function GoogleAdsTab({
  dopaEmail,
  oauthResult,
  demoMode = false,
  initialCampaigns,
  initialAccount,
}: {
  dopaEmail: string;
  oauthResult?: string;
  demoMode?: boolean;
  initialCampaigns?: LiveCampaignData[];
  initialAccount?: GoogleAdsApiResponse["accountDetails"];
}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    demoMode ? "connected" : "loading",
  );
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiErrorCode, setApiErrorCode] = useState<GoogleAdsErrorCode>();
  const [account, setAccount] = useState<
    GoogleAdsApiResponse["accountDetails"]
  >(() => initialAccount);
  const [campaigns, setCampaigns] = useState<LiveCampaignData[]>(
    () => initialCampaigns ?? [],
  );
  const [filter, setFilter] = useState<CampaignFilter>("All");
  const [notice, setNotice] = useState<string | null>(() =>
    oauthNotice(oauthResult),
  );

  const fetchGoogleAds = useCallback(async (signal?: AbortSignal) => {
    // Demo mode renders fixture data and never calls the Google Ads API.
    if (demoMode) {
      setCampaigns(initialCampaigns ?? []);
      setAccount(initialAccount);
      setApiError(null);
      setApiErrorCode(undefined);
      setConnectionState("connected");
      return;
    }
    try {
      const response = await fetch("/api/google-ads", {
        cache: "no-store",
        signal,
      });
      const data = parseGoogleAdsResponse(await response.json());

      if (response.ok && data.success) {
        setCampaigns(data.campaigns);
        setAccount(data.accountDetails);
        setApiError(null);
        setApiErrorCode(undefined);
        setConnectionState("connected");
        return;
      }

      setCampaigns([]);
      setAccount(undefined);
      setApiError(data.error ?? "Google Ads could not be connected.");
      setApiErrorCode(data.code);
      setConnectionState(connectionStateFor(data.code));
    } catch (error: unknown) {
      if (signal?.aborted) return;
      setCampaigns([]);
      setAccount(undefined);
      setApiErrorCode("network_error");
      setApiError(
        error instanceof Error
          ? `Could not load Google Ads: ${error.message}`
          : "Could not load Google Ads.",
      );
      setConnectionState("error");
    }
  }, [demoMode, initialAccount, initialCampaigns]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void fetchGoogleAds(controller.signal));
    return () => controller.abort();
  }, [fetchGoogleAds]);

  const refreshGoogleAds = () => {
    setConnectionState("loading");
    setApiError(null);
    setApiErrorCode(undefined);
    void fetchGoogleAds();
  };

  const handleOAuthConnect = async () => {
    setIsConnectingOAuth(true);
    setNotice(null);

    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", "/dashboard?tab=googleAds");
      callbackUrl.searchParams.set("google_ads", "1");

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          scopes: "https://www.googleapis.com/auth/adwords",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      setIsConnectingOAuth(false);
      setNotice(
        error instanceof Error
          ? `Google authorization failed: ${error.message}`
          : "Google authorization failed.",
      );
    }
  };

  const handleDisconnect = async () => {
    if (demoMode) {
      setNotice("Demo mode: sign up to connect your own Google Ads account.");
      return;
    }
    setNotice(null);

    try {
      const response = await fetch("/api/google-ads", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Could not clear the Google Ads connection.");
      }

      setCampaigns([]);
      setAccount(undefined);
      setApiError(null);
      setApiErrorCode("oauth_required");
      setConnectionState("oauth_required");
      setNotice(
        "Google Ads disconnected. Your Dopa session is still active.",
      );
    } catch (error: unknown) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not disconnect Google Ads.",
      );
    }
  };

  const filteredCampaigns = useMemo(
    () => campaigns.filter((campaign) => matchesFilter(campaign, filter)),
    [campaigns, filter],
  );
  const totalSpend = campaigns.reduce(
    (total, campaign) => total + campaign.spend,
    0,
  );
  const totalConversions = campaigns.reduce(
    (total, campaign) => total + campaign.conversions,
    0,
  );
  const totalConversionValue = campaigns.reduce(
    (total, campaign) => total + campaign.conversionsValue,
    0,
  );
  const totalImpressions = campaigns.reduce(
    (total, campaign) => total + campaign.impressions,
    0,
  );
  const totalClicks = campaigns.reduce(
    (total, campaign) => total + campaign.clicks,
    0,
  );
  const aggregateRoas =
    totalSpend > 0 ? totalConversionValue / totalSpend : 0;
  const aggregateCtr =
    totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const currency =
    account?.currencyCode && /^[A-Z]{3}$/.test(account.currencyCode)
      ? account.currencyCode
      : "USD";
  const accountLabel =
    account?.descriptiveName ??
    (account?.customerId
      ? `Google Ads #${account.customerId}`
      : "Connected account");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-[stagger-in_400ms_cubic-bezier(0.23,1,0.32,1)_both]">
        <div>
          <div className="flex items-center gap-2.5">
            <GoogleMark />
            <h2 className="text-[15px] font-medium text-white">
              Google Ads Integration
            </h2>
            <ConnectionBadge
              state={connectionState}
              errorCode={apiErrorCode}
            />
          </div>
          <p className="mt-1 text-[13px] text-secondary">
            Live campaign performance from the last 30 days.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {connectionState === "connected" ? (
            <>
              <button
                type="button"
                onClick={refreshGoogleAds}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-secondary transition-colors hover:border-white/20 hover:text-white"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-secondary transition-colors hover:border-red-400/30 hover:text-red-400"
              >
                Disconnect Ads
              </button>
            </>
          ) : connectionState === "oauth_required" ? (
            <ConnectButton
              isConnecting={isConnectingOAuth}
              onClick={() => void handleOAuthConnect()}
            />
          ) : (
            <button
              type="button"
              onClick={refreshGoogleAds}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-secondary transition-colors hover:border-white/20 hover:text-white"
            >
              {retryLabel(apiErrorCode)}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-[13px] text-brand animate-fade-in"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-brand/70 hover:text-brand"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {connectionState === "loading" ? (
        <LoadingState />
      ) : connectionState !== "connected" ? (
        <GoogleAdsOnboarding
          error={apiError}
          errorCode={apiErrorCode}
          oauthResult={oauthResult}
          primaryAction={
            connectionState === "oauth_required" ? (
              <ConnectButton
                isConnecting={isConnectingOAuth}
                onClick={() => void handleOAuthConnect()}
                large
              />
            ) : (
              <button
                type="button"
                onClick={refreshGoogleAds}
                className="rounded-lg bg-white px-4 py-2.5 text-[13px] font-medium text-black transition-[background-color,transform] hover:bg-white/90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {retryLabel(apiErrorCode, true)}
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] px-4 py-3 text-[12px] text-secondary">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                Account:{" "}
                <span className="font-medium text-white">
                  {accountLabel}
                </span>
              </div>
              <div className="hidden text-white/20 sm:block">|</div>
              <div>
                Dopa session:{" "}
                <span className="font-medium text-white">{dopaEmail}</span>
              </div>
              {account?.timeZone && (
                <>
                  <div className="hidden text-white/20 sm:block">|</div>
                  <div>{account.timeZone}</div>
                </>
              )}
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Google Ads API v25
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 animate-[stagger-in_400ms_cubic-bezier(0.23,1,0.32,1)_both]">
            <MetricCard
              label="Total live spend"
              value={new Intl.NumberFormat("en-US", {
                style: "currency",
                currency,
                maximumFractionDigits: 2,
              }).format(totalSpend)}
            />
            <MetricCard
              label="Live conversions"
              value={totalConversions.toLocaleString()}
            />
            <MetricCard
              label="Total ROAS"
              value={`${aggregateRoas.toFixed(2)}×`}
            />
            <MetricCard
              label="Total live CTR"
              value={`${aggregateCtr.toFixed(2)}%`}
            />
          </div>

          {campaigns.length === 0 ? (
            <div className="dopa-panel p-8 text-center">
              <p className="text-[14px] font-medium text-white">
                Account connected
              </p>
              <p className="mt-1.5 text-[13px] text-secondary">
                Google Ads returned no campaigns for the last 30 days.
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-[stagger-in_400ms_cubic-bezier(0.23,1,0.32,1)_both]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-[14px] font-medium text-white">
                  Live Google Ads Campaigns ({filteredCampaigns.length})
                </h3>
                <div
                  className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-1"
                  aria-label="Filter campaigns by channel"
                >
                  {filters.map((option) => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => setFilter(option)}
                      className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                        filter === option
                          ? "bg-white/10 font-medium text-white"
                          : "text-secondary hover:text-white"
                      }`}
                      aria-pressed={filter === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="dopa-panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] font-medium uppercase tracking-wider text-tertiary">
                        <th className="px-4 py-3">Campaign & channel</th>
                        <th className="px-4 py-3">Spend</th>
                        <th className="px-4 py-3">CTR</th>
                        <th className="px-4 py-3">Conversions</th>
                        <th className="px-4 py-3">ROAS</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {filteredCampaigns.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-10 text-center text-secondary"
                          >
                            No campaigns match this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredCampaigns.map((campaign) => (
                          <tr
                            key={campaign.id}
                            className="transition-colors hover:bg-white/[0.02]"
                          >
                            <td className="px-4 py-3.5">
                              <div className="font-medium text-white">
                                {campaign.name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-tertiary">
                                {humanizeChannel(campaign.channelType)}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-medium text-white">
                              {new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency,
                                maximumFractionDigits: 2,
                              }).format(campaign.spend)}
                            </td>
                            <td className="px-4 py-3.5 font-medium text-white">
                              {campaign.ctr.toFixed(2)}%
                            </td>
                            <td className="px-4 py-3.5 text-white">
                              {campaign.conversions.toLocaleString()}
                            </td>
                            <td className="px-4 py-3.5 font-medium text-emerald-400">
                              {campaign.roas.toFixed(2)}×
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                {campaign.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
      <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
        <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972-3.332 0-6.033-2.701-6.033-6.032s2.701-6.032 6.033-6.032c1.498 0 2.866.549 3.921 1.453l2.814-2.814C17.503 2.988 15.139 2 12.545 2 6.721 2 2 6.721 2 12.545S6.721 23.09 12.545 23.09c6.627 0 10.5-4.664 10.5-10.732 0-.663-.067-1.309-.172-1.921h-10.328z" />
      </svg>
    </span>
  );
}

function ConnectionBadge({
  state,
  errorCode,
}: {
  state: ConnectionState;
  errorCode?: GoogleAdsErrorCode;
}) {
  const connected = state === "connected";
  const label =
    state === "loading"
      ? "Checking"
      : connected
        ? "Campaign data connected"
        : state === "configuration_required"
          ? "Configuration needed"
          : errorCode === "access_denied"
            ? "Account setup needed"
          : "Not connected";

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        connected
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-amber-500/20 bg-amber-500/10 text-amber-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-emerald-400" : "bg-amber-400"
        }`}
      />
      {label}
    </span>
  );
}

function ConnectButton({
  isConnecting,
  onClick,
  large = false,
}: {
  isConnecting: boolean;
  onClick: () => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isConnecting}
      className={`inline-flex items-center gap-2.5 rounded-lg bg-white font-medium text-black shadow-lg transition-all hover:bg-white/90 active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 ${
        large ? "px-4 py-2.5 text-[13px]" : "px-4 py-2 text-[13px]"
      }`}
    >
      {isConnecting ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
          Redirecting to Google…
        </>
      ) : (
        <>
          <GoogleMark />
          Connect with Google
        </>
      )}
    </button>
  );
}

function LoadingState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.015] px-6 py-20 text-center"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      <p className="mt-4 text-[13px] text-secondary">
        Checking Google Ads authorization and campaign data…
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="dopa-panel p-4 transition-colors hover:border-white/12">
      <div className="text-[11px] font-medium uppercase tracking-wider text-tertiary">
        {label}
      </div>
      <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.03em] text-white">
        {value}
      </div>
    </div>
  );
}
