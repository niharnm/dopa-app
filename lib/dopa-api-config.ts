export const DEFAULT_DOPA_API_BASE_URL = "http://localhost:8000";

export function normalizeDopaApiBaseUrl(value: string): string {
  const url = new URL(value);
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback))
  ) {
    throw new Error(
      "Dopa scoring endpoints must use HTTPS unless they are on localhost.",
    );
  }
  return url.href.replace(/\/+$/, "");
}

export function resolveDopaApiBaseUrl(value: string | undefined): string {
  return normalizeDopaApiBaseUrl(value || DEFAULT_DOPA_API_BASE_URL);
}
