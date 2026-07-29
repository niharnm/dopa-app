import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type {
  FcCapabilityStatus,
  FcPublicRun,
  FcRunAccess,
} from "../lib/fc-sandbox/types";

type EvidenceRecord = {
  capability: string;
  status: FcCapabilityStatus;
  source: string;
  sourceDigest: string;
  observedAt: string;
  metrics: Record<string, string | number | boolean | null>;
  notes: string;
};

type ProbeResult = {
  passed: boolean;
  metrics: Record<string, string | number | boolean | null>;
  evidence?: Record<string, string | number | boolean | null>;
  note: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("FC_DEMO_BASE_URL must be HTTPS unless it is localhost.");
  }
  return url.origin;
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Request failed with ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function requiredEvents(run: FcPublicRun, names: string[]) {
  const seen = new Set(run.events.map((event) => event.eventType));
  return names.every((name) => seen.has(name));
}

function event(run: FcPublicRun, name: string) {
  const found = run.events.find((item) => item.eventType === name);
  if (!found) throw new Error(`Required event ${name} is missing.`);
  return found;
}

async function gatewayProbe(
  gatewayUrl: string,
  gatewayToken: string,
  name: string,
) {
  const response = await fetch(`${gatewayUrl}/v1/evidence/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gatewayToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      probeId: crypto.randomUUID(),
      requestedAt: new Date().toISOString(),
      ...(name === "elasticity"
        ? {
            targetCreates: Number(process.env.FC_ELASTICITY_TARGET ?? "100"),
            stressAcknowledged:
              process.env.FC_STRESS_ACK ===
              "I_ACCEPT_ALIBABA_CLOUD_CHARGES",
          }
        : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  return json<ProbeResult>(response);
}

function proveIsolation(result: ProbeResult) {
  const evidence = result.evidence ?? {};
  return (
    result.passed &&
    evidence.computeDenied === true &&
    evidence.networkDenied === true &&
    evidence.storageDenied === true
  );
}

function proveElasticity(result: ProbeResult) {
  const target = Number(process.env.FC_ELASTICITY_TARGET ?? "100");
  const creationRate = result.metrics.creationRatePerMinute;
  const peak = result.metrics.peakPerSecond;
  const successRate = result.metrics.successRatePercent;
  return (
    result.passed &&
    target >= 80_000 &&
    typeof creationRate === "number" &&
    creationRate >= target * 0.8 &&
    typeof peak === "number" &&
    peak >= 4_000 &&
    typeof successRate === "number" &&
    successRate >= 99
  );
}

function proveCompatibility(result: ProbeResult) {
  const evidence = result.evidence ?? {};
  return (
    result.passed &&
    typeof evidence.sourceDigest === "string" &&
    evidence.sourceDigest.length === 64 &&
    typeof evidence.agentRunOutputDigest === "string" &&
    evidence.agentRunOutputDigest === evidence.e2bOutputDigest
  );
}

function hasObservabilityProof(run: FcPublicRun) {
  return run.events.some(
    (event) =>
      event.eventType === "provider.trace" &&
      typeof event.metadata.slsLogstore === "string" &&
      typeof event.metadata.alertRuleId === "string" &&
      event.metadata.traceId === run.traceId,
  );
}

async function recordEvidence(records: EvidenceRecord[]) {
  if (!process.argv.includes("--record")) return;
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: existing, error: lookupError } = await supabase
    .from("fc_capability_evidence")
    .select("capability,status")
    .in(
      "capability",
      records.map((record) => record.capability),
    );
  if (lookupError) {
    throw new Error(`Evidence lookup failed: ${lookupError.code}`);
  }
  const statusRank: Record<FcCapabilityStatus, number> = {
    pending: 0,
    configured: 1,
    verified: 2,
  };
  const existingStatus = new Map(
    (existing ?? []).map((row) => [
      row.capability,
      row.status as FcCapabilityStatus,
    ]),
  );
  const advancingRecords = records.filter((record) => {
    const stored = existingStatus.get(record.capability);
    return !stored || statusRank[record.status] >= statusRank[stored];
  });
  if (advancingRecords.length === 0) return;
  const { error } = await supabase.from("fc_capability_evidence").upsert(
    advancingRecords.map((record) => ({
      capability: record.capability,
      status: record.status,
      source: record.source,
      source_digest: record.sourceDigest,
      observed_at: record.observedAt,
      metrics: record.metrics,
      notes: record.notes,
    })),
  );
  if (error) throw new Error(`Evidence recording failed: ${error.code}`);
}

const baseUrl = parseBaseUrl(requiredEnv("FC_DEMO_BASE_URL"));
const origin = baseUrl;
const started = await json<FcRunAccess>(
  await fetch(`${baseUrl}/api/fc-demo/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ scenario: "retail_launch" }),
  }),
);

if (
  started.run.provider !== "agentrun" ||
  started.run.evidenceClass !== "verified_cloud"
) {
  throw new Error(
    "The app is not in AgentRun mode. Local demonstrations cannot produce evidence.",
  );
}
if (started.run.status !== "created") {
  throw new Error(`Expected created, received ${started.run.status}.`);
}
const prepared = await json<FcPublicRun>(
  await fetch(
    `${baseUrl}/api/fc-demo/runs/${encodeURIComponent(started.run.id)}/prepare`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ accessToken: started.accessToken }),
    },
  ),
);
if (prepared.status !== "hibernated") {
  throw new Error(`Expected hibernated, received ${prepared.status}.`);
}
const checkpointBefore = prepared.checkpoint.digest;
const completed = await json<FcPublicRun>(
  await fetch(
    `${baseUrl}/api/fc-demo/runs/${encodeURIComponent(started.run.id)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        accessToken: started.accessToken,
        approvalNonce: started.approvalNonce,
      }),
    },
  ),
);

if (completed.status !== "completed" || completed.result?.source !== "tribe_v2") {
  throw new Error("The live golden path did not return a TRIBE v2 result.");
}
if (!checkpointBefore || checkpointBefore !== completed.checkpoint.digest) {
  throw new Error("Checkpoint continuity failed.");
}
if (
  !requiredEvents(completed, [
    "sandbox.created",
    "creative.validated",
    "sandbox.paused",
    "sandbox.resumed",
    "score.completed",
  ])
) {
  throw new Error("The lifecycle trace is incomplete.");
}
const createdEvent = event(completed, "sandbox.created");
const pausedEvent = event(completed, "sandbox.paused");
const resumedEvent = event(completed, "sandbox.resumed");
if (
  pausedEvent.metadata.state !== "PAUSED" ||
  resumedEvent.metadata.continuityVerified !== true
) {
  throw new Error(
    "The authoritative pause or resume evidence is incomplete.",
  );
}

const gatewayUrl = process.env.AGENTRUN_LIFECYCLE_GATEWAY_URL?.trim().replace(
  /\/$/,
  "",
);
const gatewayToken = process.env.AGENTRUN_LIFECYCLE_GATEWAY_TOKEN?.trim();
const unavailableProbe = (name: string): ProbeResult => ({
  passed: false,
  metrics: {},
  note: `${name} requires the optional evidence gateway and approved live prerequisites.`,
});
const [isolation, elasticity, compatibility] =
  gatewayUrl && gatewayToken
    ? await Promise.all([
        gatewayProbe(gatewayUrl, gatewayToken, "isolation"),
        gatewayProbe(gatewayUrl, gatewayToken, "elasticity"),
        gatewayProbe(gatewayUrl, gatewayToken, "e2b-compatibility"),
      ])
    : [
        unavailableProbe("Strong isolation"),
        unavailableProbe("Extreme elasticity"),
        unavailableProbe("E2B compatibility"),
      ];
const observedAt = new Date().toISOString();
const lifecycleSource = `dopa-run:${completed.id}`;
const lifecycleDigest = digest(completed);
const statefulVerified =
  typeof createdEvent.metadata.sessionId === "string" &&
  typeof createdEvent.metadata.dynamicMountId === "string" &&
  typeof pausedEvent.metadata.snapshotId === "string" &&
  typeof resumedEvent.metadata.dynamicMountDigest === "string";
const records: EvidenceRecord[] = [
  {
    capability: "sandbox_lifecycle",
    status: "verified",
    source: lifecycleSource,
    sourceDigest: lifecycleDigest,
    observedAt,
    metrics: { eventCount: completed.events.length },
    notes: "Create, validate, pause, resume, score, and cleanup completed.",
  },
  {
    capability: "hibernation_wakeup",
    status: "verified",
    source: lifecycleSource,
    sourceDigest: lifecycleDigest,
    observedAt,
    metrics: { hibernatedMs: completed.metrics.hibernatedMs },
    notes: "The provider confirmed PAUSED before approval and resumed afterward.",
  },
  {
    capability: "stateful_sessions",
    status: statefulVerified ? "verified" : "configured",
    source: lifecycleSource,
    sourceDigest: lifecycleDigest,
    observedAt,
    metrics: {
      checkpointMatch: true,
      sessionIdObserved:
        typeof createdEvent.metadata.sessionId === "string",
      dynamicMountObserved:
        typeof createdEvent.metadata.dynamicMountId === "string",
      snapshotObserved:
        typeof pausedEvent.metadata.snapshotId === "string",
      mountDigestObserved:
        typeof resumedEvent.metadata.dynamicMountDigest === "string",
    },
    notes: statefulVerified
      ? "Session affinity, dynamic mount, snapshot, and post-resume digests were present."
      : "Checkpoint continuity passed; dynamic-mount and snapshot evidence remains required.",
  },
  {
    capability: "observability",
    status: hasObservabilityProof(completed) ? "verified" : "configured",
    source: lifecycleSource,
    sourceDigest: lifecycleDigest,
    observedAt,
    metrics: {
      eventCount: completed.events.length,
      traceId: completed.traceId,
    },
    notes: hasObservabilityProof(completed)
      ? "SLS, trace, metrics, and an alert rule are correlated to this run."
      : "Trace events exist, but SLS logstore and alert evidence are still required.",
  },
  {
    capability: "cost_efficiency",
    status: "configured",
    source: lifecycleSource,
    sourceDigest: lifecycleDigest,
    observedAt,
    metrics: {
      activeMs: completed.metrics.activeMs,
      hibernatedMs: completed.metrics.hibernatedMs,
    },
    notes:
      "Timing is recorded, but verified billing evidence must come from the Alibaba bill export.",
  },
  ...(
    [
      ["strong_isolation", isolation, proveIsolation(isolation)],
      ["extreme_elasticity", elasticity, proveElasticity(elasticity)],
      [
        "e2b_compatibility",
        compatibility,
        proveCompatibility(compatibility),
      ],
    ] as const
  ).map(([capability, result, verified]) => {
    return {
      capability,
      status: verified ? ("verified" as const) : ("pending" as const),
      source: `agentrun-gateway:${capability}`,
      sourceDigest: digest(result),
      observedAt,
      metrics: result.metrics,
      notes: result.note,
    };
  }),
];

await recordEvidence(records);
console.log(
  JSON.stringify(
    {
      runId: completed.id,
      traceId: completed.traceId,
      observedAt,
      recorded: process.argv.includes("--record"),
      capabilities: records,
    },
    null,
    2,
  ),
);
