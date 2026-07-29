import "server-only";
import type { FcReadiness } from "@/lib/fc-sandbox/types";

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

function strongSecret(value: string | undefined) {
  const secret = value?.trim();
  return secret && new TextEncoder().encode(secret).byteLength >= 32
    ? secret
    : null;
}

function secret(value: string | undefined) {
  const candidate = value?.trim();
  return candidate ? candidate : null;
}

function email(value: string | undefined) {
  const candidate = value?.trim();
  return candidate &&
    candidate.length <= 254 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)
    ? candidate
    : null;
}

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      ? url.origin + url.pathname.replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}

function hostname(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (
    !candidate ||
    candidate.length > 253 ||
    candidate.includes("/") ||
    candidate.includes(":")
  ) {
    return null;
  }
  return /^[a-z0-9.-]+$/i.test(candidate) ? candidate : null;
}

export type FcServerConfig = {
  providerMode: "agentrun" | "local";
  tokenSecret: string | null;
  webhookSecret: string | null;
  supabaseSecretKey: string | null;
  agentRun: {
    gatewayUrl: string | null;
    gatewayToken: string | null;
    accountId: string | null;
    templateName: string | null;
    apiKey: string | null;
    apiUrl: string | null;
    domain: string | null;
  };
  scoringUrl: string | null;
  scoringToken: string | null;
  scoringIdentity: {
    supabaseUrl: string | null;
    publishableKey: string | null;
    email: string | null;
    password: string | null;
  };
  demoCreativeUrl: string | null;
  hibernationMode: "deep" | "light";
};

export function getFcServerConfig(): FcServerConfig {
  const gatewayUrl = httpsUrl(process.env.AGENTRUN_LIFECYCLE_GATEWAY_URL);
  const gatewayToken = strongSecret(
    process.env.AGENTRUN_LIFECYCLE_GATEWAY_TOKEN,
  );
  const accountId = process.env.AGENTRUN_ACCOUNT_ID?.trim() || null;
  const templateName =
    process.env.AGENTRUN_TEMPLATE_NAME?.trim() || "code-interpreter-v1";
  const apiKey = secret(process.env.E2B_API_KEY);
  const apiUrl = httpsUrl(process.env.E2B_API_URL);
  const domain = hostname(process.env.E2B_DOMAIN);
  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null;
  const tokenSecret = strongSecret(process.env.FC_DEMO_TOKEN_SECRET);
  const webhookSecret = strongSecret(process.env.FC_DEMO_WEBHOOK_SECRET);
  const scoringUrl = httpsUrl(
    process.env.DOPA_API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_DOPA_API_URL,
  );
  const scoringToken = secret(process.env.DOPA_API_INTERNAL_TOKEN);
  const scoringIdentity = {
    supabaseUrl: httpsUrl(
      process.env.DOPA_DEMO_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: secret(
      process.env.DOPA_DEMO_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    email: email(process.env.DOPA_DEMO_USER_EMAIL),
    password: strongSecret(process.env.DOPA_DEMO_USER_PASSWORD),
  };
  const siteUrl = httpsUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const demoCreativeUrl =
    httpsUrl(process.env.DOPA_DEMO_CREATIVE_URL) ||
    (siteUrl ? `${siteUrl}/demo/dopa-proof-creative.mp4` : null);
  const hibernationMode =
    process.env.AGENTRUN_HIBERNATION_MODE === "light" ? "light" : "deep";
  const requestedLive = process.env.FC_SANDBOX_PROVIDER === "agentrun";
  const directReady = Boolean(apiKey && apiUrl && domain && templateName);
  const gatewayReady = Boolean(
    gatewayUrl && gatewayToken && accountId && templateName,
  );
  const scoringIdentityReady = Boolean(
    scoringIdentity.supabaseUrl &&
      scoringIdentity.publishableKey &&
      scoringIdentity.email &&
      scoringIdentity.password,
  );
  const liveReady = Boolean(
    (directReady || gatewayReady) &&
      supabaseSecretKey &&
      tokenSecret &&
      webhookSecret &&
      scoringUrl &&
      (gatewayReady || scoringToken || scoringIdentityReady) &&
      demoCreativeUrl,
  );

  return {
    providerMode: requestedLive && liveReady ? "agentrun" : "local",
    tokenSecret,
    webhookSecret,
    supabaseSecretKey,
    agentRun: {
      gatewayUrl,
      gatewayToken,
      accountId,
      templateName,
      apiKey,
      apiUrl,
      domain,
    },
    scoringUrl,
    scoringToken,
    scoringIdentity,
    demoCreativeUrl,
    hibernationMode,
  };
}

export function getFcReadiness(): FcReadiness {
  const config = getFcServerConfig();
  const missing: string[] = [];
  if (!config.supabaseSecretKey) missing.push("SUPABASE_SECRET_KEY");
  if (!config.tokenSecret) missing.push("FC_DEMO_TOKEN_SECRET");
  if (!config.webhookSecret) missing.push("FC_DEMO_WEBHOOK_SECRET");
  const directReady = Boolean(
    config.agentRun.apiKey &&
      config.agentRun.apiUrl &&
      config.agentRun.domain,
  );
  const gatewayReady = Boolean(
    config.agentRun.gatewayUrl &&
      config.agentRun.gatewayToken &&
      config.agentRun.accountId,
  );
  if (!directReady && !gatewayReady) {
    if (!config.agentRun.apiKey) missing.push("E2B_API_KEY");
    if (!config.agentRun.apiUrl) missing.push("E2B_API_URL");
    if (!config.agentRun.domain) missing.push("E2B_DOMAIN");
  }
  if (!config.agentRun.templateName) missing.push("AGENTRUN_TEMPLATE_NAME");
  if (!config.scoringUrl) missing.push("DOPA_API_INTERNAL_URL");
  const scoringIdentityReady = Boolean(
    config.scoringIdentity.supabaseUrl &&
      config.scoringIdentity.publishableKey &&
      config.scoringIdentity.email &&
      config.scoringIdentity.password,
  );
  if (directReady && !config.scoringToken && !scoringIdentityReady) {
    missing.push(
      "DOPA_API_INTERNAL_TOKEN or DOPA_DEMO_USER_EMAIL/DOPA_DEMO_USER_PASSWORD",
    );
  }
  if (!config.demoCreativeUrl) missing.push("DOPA_DEMO_CREATIVE_URL");

  return {
    mode: config.providerMode,
    durableStore: present(config.supabaseSecretKey ?? undefined),
    liveProvider: config.providerMode === "agentrun",
    scoringBackend: Boolean(
      config.scoringUrl &&
        (gatewayReady || config.scoringToken || scoringIdentityReady),
    ),
    callbackVerification: Boolean(config.webhookSecret),
    missing,
  };
}
