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

/**
 * Origin an auth callback should return to. Vercel preview deployments return to
 * their own host so the auth cookie is set there, but only when the request URL
 * and the forwarded host agree. Production keeps the configured canonical URL.
 */
export function authCallbackOrigin(request: Request): string {
  if (process.env.VERCEL_ENV === "preview") {
    const requestOrigin = normalizedOrigin(request.url);
    const forwardedHost = (
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      ""
    )
      .split(",")[0]
      ?.trim();
    if (
      requestOrigin &&
      (!forwardedHost || new URL(requestOrigin).host === forwardedHost)
    ) {
      return requestOrigin;
    }
  }
  return siteOriginFromRequest(request.url);
}
