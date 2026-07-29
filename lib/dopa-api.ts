import { isJsonObject, stringValue } from "@/lib/validation";
import { resolveDopaApiBaseUrl } from "@/lib/dopa-api-config";

export { normalizeDopaApiBaseUrl } from "@/lib/dopa-api-config";

const MAX_SCORE_RESPONSE_BYTES = 1024 * 1024;
const MAX_BRAIN_MODEL_BYTES = 32 * 1024 * 1024;
const MAX_BRAIN_FRAMES = 600;
const MAX_BRAIN_VERTICES_PER_HEMISPHERE = 200_000;

export const DOPA_API_BASE_URL = resolveDopaApiBaseUrl(
  process.env.NEXT_PUBLIC_DOPA_API_URL,
);

export type BrainRegionResponse = {
  region_id: string;
  name: string;
  hemisphere: "left" | "right";
  relative_response: number;
  peak_second: number;
  description: string;
};

export type BrainResponse = {
  status: "ready" | "unavailable";
  model_path: string | null;
  expires_at: string | null;
  duration_seconds: number;
  hemodynamic_lag_seconds: number;
  top_regions: BrainRegionResponse[];
};

export type BrainHemisphereModel = {
  hemisphere: "left" | "right";
  vertex_count: number;
  positions_f32: string;
  indices_u32: string;
  responses_u8: string;
};

export type BrainModelPayload = {
  version: 1;
  frame_count: number;
  frame_interval_seconds: number;
  response_encoding: "uint8-absolute-p99";
  hemispheres: BrainHemisphereModel[];
};

export type ScoreResponse = {
  metric: "predicted_average_ctr";
  score_percent: number;
  raw_mean_ictr: number;
  processing_seconds: number;
  model_load_seconds: number;
  peak_vram_mib: number;
  model_version: string;
  brain_response: BrainResponse;
};

export class DopaApiError extends Error {
  status: number;
  retryAfter: number | null;

  constructor(message: string, status = 0, retryAfter: number | null = null) {
    super(message);
    this.name = "DopaApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function apiUrl(path: string): string {
  const base = new URL(`${DOPA_API_BASE_URL}/`);
  const resolved = new URL(path, base);
  if (resolved.origin !== base.origin) {
    throw new DopaApiError(
      "The scoring API returned an unsafe cortical model URL.",
    );
  }
  return resolved.href;
}

function responseDetail(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    return typeof parsed.detail === "string" &&
      parsed.detail.length <= 500
      ? parsed.detail
      : fallback;
  } catch {
    return fallback;
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseBrainRegion(value: unknown): BrainRegionResponse | null {
  if (!isJsonObject(value)) return null;
  const regionId = stringValue(value.region_id, 120);
  const name = stringValue(value.name, 200);
  const description = stringValue(value.description, 1_000);
  const relativeResponse = finiteNumber(value.relative_response);
  const peakSecond = finiteNumber(value.peak_second);
  if (
    !regionId ||
    !name ||
    !description ||
    (value.hemisphere !== "left" && value.hemisphere !== "right") ||
    relativeResponse === null ||
    peakSecond === null
  ) {
    return null;
  }
  return {
    region_id: regionId,
    name,
    hemisphere: value.hemisphere,
    relative_response: relativeResponse,
    peak_second: peakSecond,
    description,
  };
}

function parseScoreResponse(value: unknown): ScoreResponse {
  if (
    !isJsonObject(value) ||
    value.metric !== "predicted_average_ctr" ||
    !isJsonObject(value.brain_response)
  ) {
    throw new DopaApiError("The scoring API returned an invalid response.");
  }

  const brain = value.brain_response;
  const status =
    brain.status === "ready" || brain.status === "unavailable"
      ? brain.status
      : null;
  const topRegions = Array.isArray(brain.top_regions)
    ? brain.top_regions
        .map(parseBrainRegion)
        .filter((region): region is BrainRegionResponse => region !== null)
    : null;
  const modelPath =
    brain.model_path === null ? null : stringValue(brain.model_path, 2_048);
  const expiresAt =
    brain.expires_at === null ? null : stringValue(brain.expires_at, 120);
  const scorePercent = finiteNumber(value.score_percent);
  const rawMeanIctr = finiteNumber(value.raw_mean_ictr);
  const processingSeconds = finiteNumber(value.processing_seconds);
  const modelLoadSeconds = finiteNumber(value.model_load_seconds);
  const peakVramMib = finiteNumber(value.peak_vram_mib);
  const modelVersion = stringValue(value.model_version, 200);
  const durationSeconds = finiteNumber(brain.duration_seconds);
  const lagSeconds = finiteNumber(brain.hemodynamic_lag_seconds);

  if (
    !status ||
    !topRegions ||
    scorePercent === null ||
    rawMeanIctr === null ||
    processingSeconds === null ||
    modelLoadSeconds === null ||
    peakVramMib === null ||
    !modelVersion ||
    durationSeconds === null ||
    lagSeconds === null
  ) {
    throw new DopaApiError("The scoring API returned an invalid response.");
  }
  if (
    scorePercent < 0 ||
    scorePercent > 100 ||
    rawMeanIctr < 0 ||
    processingSeconds < 0 ||
    modelLoadSeconds < 0 ||
    peakVramMib < 0 ||
    durationSeconds < 0 ||
    durationSeconds > 600 ||
    lagSeconds < 0 ||
    lagSeconds > 120 ||
    topRegions.length > 100
  ) {
    throw new DopaApiError("The scoring API returned values outside safe limits.");
  }

  return {
    metric: "predicted_average_ctr",
    score_percent: scorePercent,
    raw_mean_ictr: rawMeanIctr,
    processing_seconds: processingSeconds,
    model_load_seconds: modelLoadSeconds,
    peak_vram_mib: peakVramMib,
    model_version: modelVersion,
    brain_response: {
      status,
      model_path: modelPath ?? null,
      expires_at: expiresAt ?? null,
      duration_seconds: durationSeconds,
      hemodynamic_lag_seconds: lagSeconds,
      top_regions: topRegions,
    },
  };
}

function parseBrainModel(value: unknown): BrainModelPayload {
  const frameInterval = isJsonObject(value)
    ? finiteNumber(value.frame_interval_seconds)
    : null;
  if (
    !isJsonObject(value) ||
    value.version !== 1 ||
    value.response_encoding !== "uint8-absolute-p99" ||
    !Number.isInteger(value.frame_count) ||
    typeof value.frame_count !== "number" ||
    value.frame_count < 1 ||
    value.frame_count > MAX_BRAIN_FRAMES ||
    frameInterval === null ||
    frameInterval <= 0 ||
    frameInterval > 60 ||
    !Array.isArray(value.hemispheres)
  ) {
    throw new DopaApiError(
      "The cortical model returned data the browser could not read.",
    );
  }

  const hemispheres: BrainHemisphereModel[] = value.hemispheres.flatMap(
    (hemisphere) => {
      if (
        !isJsonObject(hemisphere) ||
        (hemisphere.hemisphere !== "left" &&
          hemisphere.hemisphere !== "right") ||
        typeof hemisphere.vertex_count !== "number" ||
        !Number.isInteger(hemisphere.vertex_count) ||
        hemisphere.vertex_count < 1 ||
        hemisphere.vertex_count > MAX_BRAIN_VERTICES_PER_HEMISPHERE
      ) {
        return [];
      }
      const positions = stringValue(
        hemisphere.positions_f32,
        MAX_BRAIN_MODEL_BYTES,
      );
      const indices = stringValue(
        hemisphere.indices_u32,
        MAX_BRAIN_MODEL_BYTES,
      );
      const responses = stringValue(
        hemisphere.responses_u8,
        MAX_BRAIN_MODEL_BYTES,
      );
      if (!positions || !indices || !responses) return [];
      if (
        positions.length + indices.length + responses.length >
        MAX_BRAIN_MODEL_BYTES
      ) {
        return [];
      }
      return [
        {
          hemisphere: hemisphere.hemisphere,
          vertex_count: hemisphere.vertex_count,
          positions_f32: positions,
          indices_u32: indices,
          responses_u8: responses,
        },
      ];
    },
  );
  if (
    hemispheres.length !== 2 ||
    new Set(hemispheres.map(({ hemisphere }) => hemisphere)).size !== 2
  ) {
    throw new DopaApiError(
      "The cortical model returned data the browser could not read.",
    );
  }

  return {
    version: 1,
    frame_count: value.frame_count,
    frame_interval_seconds: frameInterval,
    response_encoding: "uint8-absolute-p99",
    hemispheres,
  };
}

export function scoreAd({
  file,
  accessToken,
  signal,
  onUploadProgress,
}: {
  file: File;
  accessToken: string;
  signal: AbortSignal;
  onUploadProgress: (percentage: number) => void;
}): Promise<ScoreResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Analysis cancelled.", "AbortError"));
      return;
    }
    const request = new XMLHttpRequest();
    const abortRequest = () => request.abort();
    let responseTooLarge = false;

    request.open("POST", apiUrl("/v1/score"));
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    request.timeout = 10 * 60 * 1000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress(Math.min(100, (event.loaded / event.total) * 100));
      }
    };
    request.upload.onload = () => onUploadProgress(100);
    request.onprogress = (event) => {
      if (event.loaded > MAX_SCORE_RESPONSE_BYTES) {
        responseTooLarge = true;
        request.abort();
      }
    };
    request.onload = () => {
      signal.removeEventListener("abort", abortRequest);
      if (request.status >= 200 && request.status < 300) {
        if (request.responseText.length > MAX_SCORE_RESPONSE_BYTES) {
          reject(
            new DopaApiError(
              "The scoring API response exceeded the safe size limit.",
            ),
          );
          return;
        }
        try {
          resolve(parseScoreResponse(JSON.parse(request.responseText)));
        } catch (error: unknown) {
          reject(
            error instanceof DopaApiError
              ? error
              : new DopaApiError(
                  "The scoring API returned an invalid response.",
                ),
          );
        }
        return;
      }
      const retryHeader = request.getResponseHeader("Retry-After");
      const retryAfter = retryHeader
        ? Number.parseInt(retryHeader, 10)
        : null;
      reject(
        new DopaApiError(
          responseDetail(request.responseText, "The ad could not be scored."),
          request.status,
          retryAfter !== null && Number.isFinite(retryAfter)
            ? retryAfter
            : null,
        ),
      );
    };
    request.onerror = () => {
      signal.removeEventListener("abort", abortRequest);
      reject(
        new DopaApiError(
          `Could not reach the Dopa API at ${DOPA_API_BASE_URL}.`,
        ),
      );
    };
    request.ontimeout = () => {
      signal.removeEventListener("abort", abortRequest);
      reject(new DopaApiError("Analysis took too long. Try a shorter ad."));
    };
    request.onabort = () => {
      signal.removeEventListener("abort", abortRequest);
      reject(
        responseTooLarge
          ? new DopaApiError(
              "The scoring API response exceeded the safe size limit.",
            )
          : new DOMException("Analysis cancelled.", "AbortError"),
      );
    };

    signal.addEventListener("abort", abortRequest, { once: true });
    const body = new FormData();
    body.append("file", file);
    request.send(body);
  });
}

export function fetchBrainModel({
  path,
  accessToken,
  signal,
  onDownloadProgress,
}: {
  path: string;
  accessToken: string;
  signal: AbortSignal;
  onDownloadProgress: (percentage: number | null) => void;
}): Promise<BrainModelPayload> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Analysis cancelled.", "AbortError"));
      return;
    }
    const request = new XMLHttpRequest();
    const abortRequest = () => request.abort();
    let responseTooLarge = false;

    request.open("GET", apiUrl(path));
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    request.timeout = 2 * 60 * 1000;
    request.onprogress = (event) => {
      if (event.loaded > MAX_BRAIN_MODEL_BYTES) {
        responseTooLarge = true;
        request.abort();
        return;
      }
      onDownloadProgress(
        event.lengthComputable && event.total > 0
          ? Math.min(100, (event.loaded / event.total) * 100)
          : null,
      );
    };
    request.onload = () => {
      signal.removeEventListener("abort", abortRequest);
      if (request.status >= 200 && request.status < 300) {
        if (request.responseText.length > MAX_BRAIN_MODEL_BYTES) {
          reject(
            new DopaApiError(
              "The cortical model response exceeded the safe size limit.",
            ),
          );
          return;
        }
        try {
          resolve(parseBrainModel(JSON.parse(request.responseText)));
        } catch (error: unknown) {
          reject(
            error instanceof DopaApiError
              ? error
              : new DopaApiError(
                  "The cortical model returned data the browser could not read.",
                ),
          );
        }
        return;
      }
      reject(
        new DopaApiError(
          responseDetail(
            request.responseText,
            "The cortical model could not be loaded.",
          ),
          request.status,
        ),
      );
    };
    request.onerror = () => {
      signal.removeEventListener("abort", abortRequest);
      reject(
        new DopaApiError(
          `Could not reach the Dopa API at ${DOPA_API_BASE_URL}.`,
        ),
      );
    };
    request.ontimeout = () => {
      signal.removeEventListener("abort", abortRequest);
      reject(new DopaApiError("The cortical model took too long to load."));
    };
    request.onabort = () => {
      signal.removeEventListener("abort", abortRequest);
      reject(
        responseTooLarge
          ? new DopaApiError(
              "The cortical model response exceeded the safe size limit.",
            )
          : new DOMException("Analysis cancelled.", "AbortError"),
      );
    };

    signal.addEventListener("abort", abortRequest, { once: true });
    request.send();
  });
}
