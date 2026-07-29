export type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function normalizeOptionalHttpUrl(
  value: string | null | undefined,
):
  | { success: true; value: string | null }
  | { success: false; error: string } {
  const trimmed = value?.trim();
  if (!trimmed) return { success: true, value: null };
  if (trimmed.length > 2_048 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return { success: false, error: "Enter a valid website URL." };
  }
  if (
    /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) &&
    !/^https?:\/\//i.test(trimmed)
  ) {
    return { success: false, error: "Enter a valid HTTP or HTTPS website URL." };
  }

  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    ) {
      return {
        success: false,
        error: "Enter a valid public website URL.",
      };
    }
    url.hostname = hostname;
    return { success: true, value: url.href };
  } catch {
    return { success: false, error: "Enter a valid website URL." };
  }
}

export function stringValue(
  value: unknown,
  maximumLength = 2_000,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximumLength) : undefined;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function parseGroqJson(response: unknown): JsonObject {
  if (!isJsonObject(response) || !Array.isArray(response.choices)) {
    throw new Error("The AI service returned an invalid response.");
  }

  const firstChoice = response.choices[0];
  if (!isJsonObject(firstChoice) || !isJsonObject(firstChoice.message)) {
    throw new Error("The AI service returned an invalid response.");
  }

  const content = stringValue(firstChoice.message.content, 100_000);
  if (!content) {
    throw new Error("The AI service returned an empty response.");
  }

  const parsed: unknown = JSON.parse(content);
  if (!isJsonObject(parsed)) {
    throw new Error("The AI service returned an invalid JSON object.");
  }
  return parsed;
}
