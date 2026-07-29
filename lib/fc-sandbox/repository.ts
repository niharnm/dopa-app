import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getFcServerConfig } from "@/lib/fc-sandbox/config";
import { maskSandboxReference } from "@/lib/fc-sandbox/lifecycle";
import type {
  FcCapabilityEvidence,
  FcCapabilityStatus,
  FcPublicRun,
  FcResult,
  FcRunEvent,
  FcRunRecord,
  FcRunStatus,
} from "@/lib/fc-sandbox/types";

type RunPatch = Partial<
  Pick<
    FcRunRecord,
    | "status"
    | "sandboxId"
    | "sandboxState"
    | "checkpointHash"
    | "checkpointVersion"
    | "result"
    | "safeErrorCode"
    | "pausedAt"
    | "resumedAt"
    | "completedAt"
    | "activeMs"
    | "hibernatedMs"
    | "wakeLatencyMs"
    | "approvalNonceHash"
  >
>;

type MemoryState = {
  runs: Map<string, FcRunRecord>;
  events: Map<string, FcRunEvent[]>;
};

declare global {
  var __dopaFcDemoState: MemoryState | undefined;
}

const memoryState =
  globalThis.__dopaFcDemoState ??
  (globalThis.__dopaFcDemoState = {
    runs: new Map<string, FcRunRecord>(),
    events: new Map<string, FcRunEvent[]>(),
  });

const CAPABILITY_DEFINITIONS = [
  {
    capability: "sandbox_lifecycle",
    label: "Sandbox lifecycle",
    requirement: "Create, execute, stop, and clean up an isolated AgentRun sandbox.",
  },
  {
    capability: "hibernation_wakeup",
    label: "Hibernation & wake-up",
    requirement:
      "Reach PAUSED, measure wake latency, and quantify bill-backed savings.",
  },
  {
    capability: "stateful_sessions",
    label: "Stateful sessions",
    requirement:
      "Prove session affinity, dynamic mount, and consistent state after resume.",
  },
  {
    capability: "strong_isolation",
    label: "Strong isolation",
    requirement:
      "Prevent cross-sandbox compute, network, and storage sentinel access.",
  },
  {
    capability: "extreme_elasticity",
    label: "Extreme elasticity",
    requirement:
      "Run a near-peak burst and report creation rate, peak, success, and latency.",
  },
  {
    capability: "e2b_compatibility",
    label: "E2B compatibility",
    requirement: "Run the compatibility probe against the live AgentRun adapter.",
  },
  {
    capability: "observability",
    label: "Traceability",
    requirement: "Correlate app, gateway, sandbox, and scoring events with one trace ID.",
  },
  {
    capability: "cost_efficiency",
    label: "Cost efficiency",
    requirement: "Measure billed active time and the hibernated no-compute interval.",
  },
] as const;

function adminClient(requireDurable = true): SupabaseClient | null {
  const config = getFcServerConfig();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url || !config.supabaseSecretKey) {
    if (requireDurable && process.env.NODE_ENV === "production") {
      throw new Error("FC durable storage is not configured.");
    }
    return null;
  }
  return createClient(url, config.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toRunRow(run: FcRunRecord) {
  return {
    id: run.id,
    trace_id: run.traceId,
    public_token_hash: run.publicTokenHash,
    approval_nonce_hash: run.approvalNonceHash,
    request_fingerprint_hash: run.requestFingerprintHash,
    scenario: run.scenario,
    provider: run.provider,
    evidence_class: run.evidenceClass,
    status: run.status,
    sandbox_id: run.sandboxId,
    sandbox_state: run.sandboxState,
    checkpoint_hash: run.checkpointHash,
    checkpoint_version: run.checkpointVersion,
    result: run.result,
    safe_error_code: run.safeErrorCode,
    requested_at: run.requestedAt,
    paused_at: run.pausedAt,
    resumed_at: run.resumedAt,
    completed_at: run.completedAt,
    active_ms: run.activeMs,
    hibernated_ms: run.hibernatedMs,
    wake_latency_ms: run.wakeLatencyMs,
    expires_at: run.expiresAt,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
  };
}

function toEventRow(runId: string, event: FcRunEvent) {
  return {
    run_id: runId,
    sequence: event.sequence,
    event_type: event.eventType,
    stage: event.stage,
    summary: event.summary,
    evidence_class: event.evidenceClass,
    checkpoint_hash: event.checkpointHash,
    duration_ms: event.durationMs,
    metadata: event.metadata,
    occurred_at: event.occurredAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseResult(value: unknown): FcResult | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  const confidencePercent =
    value.confidencePercent === null
      ? null
      : typeof value.confidencePercent === "number" &&
          Number.isFinite(value.confidencePercent)
        ? value.confidencePercent
        : undefined;
  if (
    typeof value.predictedCtrPercent !== "number" ||
    confidencePercent === undefined ||
    typeof value.recommendation !== "string" ||
    (source !== "tribe_v2" && source !== "demonstration_fixture")
  ) {
    return null;
  }
  return {
    predictedCtrPercent: value.predictedCtrPercent,
    confidencePercent,
    recommendation: value.recommendation,
    source,
    modelVersion: nullableString(value.modelVersion),
    processingSeconds:
      value.processingSeconds === null
        ? null
        : typeof value.processingSeconds === "number" &&
            Number.isFinite(value.processingSeconds)
          ? value.processingSeconds
          : null,
  };
}

function parseRun(row: unknown): FcRunRecord {
  if (!isRecord(row)) throw new Error("FC run storage returned an invalid row.");
  return {
    id: String(row.id),
    traceId: String(row.trace_id),
    publicTokenHash: String(row.public_token_hash),
    approvalNonceHash: String(row.approval_nonce_hash),
    requestFingerprintHash: String(row.request_fingerprint_hash),
    scenario: "retail_launch",
    provider: row.provider === "agentrun" ? "agentrun" : "local",
    evidenceClass:
      row.evidence_class === "verified_cloud"
        ? "verified_cloud"
        : "local_demonstration",
    status: String(row.status) as FcRunStatus,
    sandboxId: nullableString(row.sandbox_id),
    sandboxState: nullableString(row.sandbox_state),
    checkpointHash: nullableString(row.checkpoint_hash),
    checkpointVersion: numberValue(row.checkpoint_version),
    result: parseResult(row.result),
    safeErrorCode: nullableString(row.safe_error_code),
    requestedAt: String(row.requested_at),
    pausedAt: nullableString(row.paused_at),
    resumedAt: nullableString(row.resumed_at),
    completedAt: nullableString(row.completed_at),
    activeMs: numberValue(row.active_ms),
    hibernatedMs: numberValue(row.hibernated_ms),
    wakeLatencyMs:
      row.wake_latency_ms === null
        ? null
        : numberValue(row.wake_latency_ms),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseEvent(row: unknown): FcRunEvent {
  if (!isRecord(row)) throw new Error("FC event storage returned an invalid row.");
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const safeMetadata: FcRunEvent["metadata"] = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      safeMetadata[key] = value;
    }
  }
  return {
    sequence: numberValue(row.sequence),
    eventType: String(row.event_type),
    stage: String(row.stage) as FcRunStatus,
    summary: String(row.summary),
    evidenceClass:
      row.evidence_class === "verified_cloud"
        ? "verified_cloud"
        : "local_demonstration",
    occurredAt: String(row.occurred_at),
    durationMs:
      row.duration_ms === null ? null : numberValue(row.duration_ms),
    checkpointHash: nullableString(row.checkpoint_hash),
    metadata: safeMetadata,
  };
}

function patchToRow(patch: RunPatch) {
  const row: Record<string, unknown> = {};
  const map: Array<[keyof RunPatch, string]> = [
    ["status", "status"],
    ["sandboxId", "sandbox_id"],
    ["sandboxState", "sandbox_state"],
    ["checkpointHash", "checkpoint_hash"],
    ["checkpointVersion", "checkpoint_version"],
    ["result", "result"],
    ["safeErrorCode", "safe_error_code"],
    ["pausedAt", "paused_at"],
    ["resumedAt", "resumed_at"],
    ["completedAt", "completed_at"],
    ["activeMs", "active_ms"],
    ["hibernatedMs", "hibernated_ms"],
    ["wakeLatencyMs", "wake_latency_ms"],
    ["approvalNonceHash", "approval_nonce_hash"],
  ];
  for (const [key, column] of map) {
    if (Object.hasOwn(patch, key)) row[column] = patch[key];
  }
  return row;
}

export async function createRun(run: FcRunRecord, event: FcRunEvent) {
  const client = adminClient();
  if (!client) {
    memoryState.runs.set(run.id, run);
    memoryState.events.set(run.id, [event]);
    return run;
  }

  const { data, error } = await client.rpc("create_fc_demo_run", {
    p_run: toRunRow(run),
    p_event: toEventRow(run.id, event),
  });
  if (error) throw new Error(`FC run insert failed: ${error.code}`);
  return parseRun(data);
}

export async function getRun(runId: string) {
  const client = adminClient();
  if (!client) return memoryState.runs.get(runId) ?? null;
  const { data, error } = await client
    .from("fc_demo_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`FC run lookup failed: ${error.code}`);
  return data ? parseRun(data) : null;
}

export async function getEvents(runId: string) {
  const client = adminClient();
  if (!client) return [...(memoryState.events.get(runId) ?? [])];
  const { data, error } = await client
    .from("fc_demo_run_events")
    .select("*")
    .eq("run_id", runId)
    .order("sequence", { ascending: true });
  if (error) throw new Error(`FC event lookup failed: ${error.code}`);
  return (data ?? []).map(parseEvent);
}

export async function countRecentRuns(
  fingerprintHash: string,
  since: string,
) {
  const client = adminClient();
  if (!client) {
    return [...memoryState.runs.values()].filter(
      (run) =>
        run.requestFingerprintHash === fingerprintHash &&
        Date.parse(run.createdAt) >= Date.parse(since),
    ).length;
  }
  const { count, error } = await client
    .from("fc_demo_runs")
    .select("id", { count: "exact", head: true })
    .eq("request_fingerprint_hash", fingerprintHash)
    .gte("created_at", since);
  if (error) throw new Error(`FC quota lookup failed: ${error.code}`);
  return count ?? 0;
}

export async function consumeRunQuota(
  fingerprintHash: string,
  since: string,
  limit: number,
) {
  const client = adminClient();
  if (!client) {
    const recent = await countRecentRuns(fingerprintHash, since);
    return {
      allowed: recent < limit,
      retryAfterSeconds: recent < limit ? 0 : 3_600,
    };
  }

  const { data, error } = await client.rpc("consume_fc_demo_quota", {
    p_fingerprint_hash: fingerprintHash,
  });
  const result = Array.isArray(data) ? data[0] : null;
  if (
    error ||
    !isRecord(result) ||
    typeof result.allowed !== "boolean" ||
    typeof result.retry_after_seconds !== "number"
  ) {
    throw new Error(
      `FC quota reservation failed: ${error?.code ?? "invalid_response"}`,
    );
  }
  return {
    allowed: result.allowed,
    retryAfterSeconds: Math.max(
      0,
      Math.ceil(result.retry_after_seconds),
    ),
  };
}

export async function transitionRun(
  runId: string,
  expectedStatus: FcRunStatus,
  patch: RunPatch & { status: FcRunStatus },
  event: FcRunEvent,
) {
  const client = adminClient();
  if (!client) {
    const current = memoryState.runs.get(runId);
    if (!current || current.status !== expectedStatus) return null;
    const updated: FcRunRecord = {
      ...current,
      ...patch,
      updatedAt: event.occurredAt,
    };
    memoryState.runs.set(runId, updated);
    memoryState.events.set(runId, [
      ...(memoryState.events.get(runId) ?? []),
      event,
    ]);
    return updated;
  }

  const { data, error } = await client.rpc("transition_fc_demo_run", {
    p_run_id: runId,
    p_expected_status: expectedStatus,
    p_next_status: patch.status,
    p_patch: patchToRow(patch),
    p_event: toEventRow(runId, event),
  });
  if (error) throw new Error(`FC run transition failed: ${error.code}`);
  if (!data) return null;
  return parseRun(data);
}

export async function appendRunEvent(runId: string, event: FcRunEvent) {
  const client = adminClient();
  if (!client) {
    if (!memoryState.runs.has(runId)) return false;
    const providerEventId = event.metadata.providerEventId;
    if (
      typeof providerEventId === "string" &&
      (memoryState.events.get(runId) ?? []).some(
        (existing) =>
          existing.metadata.providerEventId === providerEventId,
      )
    ) {
      return true;
    }
    memoryState.events.set(runId, [
      ...(memoryState.events.get(runId) ?? []),
      event,
    ]);
    return true;
  }
  const { data, error } = await client.rpc("append_fc_demo_event", {
    p_run_id: runId,
    p_event: toEventRow(runId, event),
  });
  if (error) throw new Error(`FC event insert failed: ${error.code}`);
  return data === true;
}

export async function toPublicRun(run: FcRunRecord): Promise<FcPublicRun> {
  return {
    id: run.id,
    traceId: run.traceId,
    scenario: run.scenario,
    provider: run.provider,
    evidenceClass: run.evidenceClass,
    status: run.status,
    sandbox: {
      reference: maskSandboxReference(run.sandboxId),
      state: run.sandboxState,
    },
    checkpoint: {
      digest: run.checkpointHash,
      version: run.checkpointVersion,
    },
    timestamps: {
      requestedAt: run.requestedAt,
      pausedAt: run.pausedAt,
      resumedAt: run.resumedAt,
      completedAt: run.completedAt,
    },
    metrics: {
      activeMs: run.activeMs,
      hibernatedMs: run.hibernatedMs,
      wakeLatencyMs: run.wakeLatencyMs,
    },
    result: run.result,
    errorCode: run.safeErrorCode,
    events: await getEvents(run.id),
  };
}

export async function getCapabilityEvidence(
  configuredCapabilities: Set<string>,
): Promise<FcCapabilityEvidence[]> {
  const client = adminClient(false);
  let rows: unknown[] = [];
  if (client) {
    const { data, error } = await client
      .from("fc_capability_evidence")
      .select("*");
    if (error) throw new Error(`FC evidence lookup failed: ${error.code}`);
    rows = data ?? [];
  }
  const byCapability = new Map(
    rows
      .filter(isRecord)
      .map((row) => [String(row.capability), row] as const),
  );

  return CAPABILITY_DEFINITIONS.map((definition) => {
    const row = byCapability.get(definition.capability);
    const storedStatus =
      row?.status === "verified" ||
      row?.status === "configured" ||
      row?.status === "pending"
        ? row.status
        : null;
    const status: FcCapabilityStatus =
      storedStatus === "verified"
        ? "verified"
        : configuredCapabilities.has(definition.capability)
          ? "configured"
          : "pending";
    const metrics = isRecord(row?.metrics) ? row.metrics : {};
    const safeMetrics: FcCapabilityEvidence["metrics"] = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        safeMetrics[key] = value;
      }
    }
    return {
      ...definition,
      status,
      source: nullableString(row?.source),
      observedAt: nullableString(row?.observed_at),
      metrics: safeMetrics,
      note:
        nullableString(row?.notes) ??
        (status === "configured"
          ? "Implementation is configured; a live evidence run is still required."
          : "No live provider evidence has been recorded yet."),
    };
  });
}
