import { type NextRequest, NextResponse } from "next/server";
import { resolveDopaApiBaseUrl } from "@/lib/dopa-api-config";
import { updateSession } from "@/utils/supabase/middleware";

function originSource(value: string | undefined): string | null {
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

export function contentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const connectSources = new Set(["'self'"]);
  const supabaseOrigin = originSource(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const dopaApiOrigin = originSource(
    resolveDopaApiBaseUrl(process.env.NEXT_PUBLIC_DOPA_API_URL),
  );

  if (supabaseOrigin) {
    connectSources.add(supabaseOrigin);
    connectSources.add(supabaseOrigin.replace(/^http/, "ws"));
  }
  if (dopaApiOrigin) connectSources.add(dopaApiOrigin);

  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDevelopment ? " 'unsafe-eval'" : ""
    };
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    media-src 'self' blob:;
    font-src 'self';
    connect-src ${[...connectSources].join(" ")};
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    manifest-src 'self';
    ${isDevelopment ? "" : "upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function requiresSessionRefresh(pathname: string) {
  return !(
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname === "/fc-proof" ||
    pathname.startsWith("/api/fc-demo/")
  );
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = requiresSessionRefresh(request.nextUrl.pathname)
    ? await updateSession(request, requestHeaders)
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)",
  ],
};
