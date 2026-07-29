import { isJsonObject, type JsonObject } from "@/lib/validation";
import { NextResponse } from "next/server";

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Origin",
} as const;

type JsonRequestResult =
  | { success: true; data: JsonObject }
  | { success: false; response: NextResponse };

type TextRequestResult =
  | { success: true; data: string }
  | { success: false; response: NextResponse };

function normalizedOrigin(value: string | null | undefined): string | null {
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

export function isSameOriginRequest(request: Request): boolean {
  const requestOrigin = normalizedOrigin(request.headers.get("origin"));
  if (!requestOrigin) return false;

  const allowedOrigins = new Set<string>();
  const urlOrigin = normalizedOrigin(request.url);
  const configuredOrigin = normalizedOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (urlOrigin) allowedOrigins.add(urlOrigin);
  if (configuredOrigin) allowedOrigins.add(configuredOrigin);

  return allowedOrigins.has(requestOrigin);
}

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        ...NO_STORE_HEADERS,
        ...headers,
      },
    },
  );
}

export async function readJsonObjectRequest(
  request: Request,
  maximumBytes = 32_000,
): Promise<JsonRequestResult> {
  if (!isSameOriginRequest(request)) {
    return {
      success: false,
      response: jsonError("This request origin is not allowed.", 403),
    };
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return {
      success: false,
      response: jsonError("Send a JSON request.", 415),
    };
  }

  const textResult = await readBoundedRequestText(request, maximumBytes);
  if (!textResult.success) return textResult;

  try {
    const data: unknown = JSON.parse(textResult.data);
    if (!isJsonObject(data)) {
      return {
        success: false,
        response: jsonError("Send a valid JSON object.", 400),
      };
    }
    return { success: true, data };
  } catch {
    return {
      success: false,
      response: jsonError("Send a valid JSON request.", 400),
    };
  }
}

export async function readBoundedRequestText(
  request: Request,
  maximumBytes: number,
): Promise<TextRequestResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maximumBytes
    ) {
      return {
        success: false,
        response: jsonError("The request is too large.", 413),
      };
    }
  }

  if (!request.body) {
    return {
      success: false,
      response: jsonError("Send a valid JSON request.", 400),
    };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let rawBody = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      bytesRead += chunk.value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        return {
          success: false,
          response: jsonError("The request is too large.", 413),
        };
      }
      rawBody += decoder.decode(chunk.value, { stream: true });
    }
    rawBody += decoder.decode();
  } catch {
    return {
      success: false,
      response: jsonError("Send a valid JSON request.", 400),
    };
  }

  return { success: true, data: rawBody };
}

export async function readBoundedResponseBytes(
  response: Response,
  maximumBytes: number,
  errorMessage: string,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maximumBytes
    ) {
      await response.body?.cancel();
      throw new Error(errorMessage);
    }
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(errorMessage);
    }
    chunks.push(chunk.value);
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
  errorMessage: string,
): Promise<string> {
  return new TextDecoder().decode(
    await readBoundedResponseBytes(response, maximumBytes, errorMessage),
  );
}
