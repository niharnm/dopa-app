export function normalizedOrigin(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function vercelProductionOrigin(): string | null {
  const hostname = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return hostname ? normalizedOrigin(`https://${hostname}`) : null;
}

export function configuredSiteOrigin(): string | null {
  return (
    normalizedOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    vercelProductionOrigin()
  );
}

export function siteOriginFromRequest(requestUrl: string): string {
  const configured = configuredSiteOrigin();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be configured for production authentication.",
    );
  }

  return normalizedOrigin(requestUrl) ?? "http://localhost:3000";
}
