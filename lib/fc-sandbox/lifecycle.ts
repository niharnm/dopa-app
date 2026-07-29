import { createHash } from "node:crypto";
import type {
  FcEvidenceClass,
  FcResult,
  FcRunEvent,
  FcRunRecord,
  FcRunStatus,
} from "@/lib/fc-sandbox/types";

const ALLOWED_TRANSITIONS: Record<FcRunStatus, readonly FcRunStatus[]> = {
  created: ["provisioning", "failed"],
  provisioning: ["validating", "failed"],
  validating: ["awaiting_approval", "failed"],
  awaiting_approval: ["pausing", "failed"],
  pausing: ["hibernated", "failed"],
  hibernated: ["resuming", "failed"],
  resuming: ["scoring", "failed"],
  scoring: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function canTransition(from: FcRunStatus, to: FcRunStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: FcRunStatus, to: FcRunStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid FC run transition: ${from} -> ${to}`);
  }
}

export function checkpointDigest(
  runId: string,
  traceId: string,
  version: number,
  stage: FcRunStatus,
) {
  return createHash("sha256")
    .update(`${runId}:${traceId}:${version}:${stage}`)
    .digest("hex");
}

export function maskSandboxReference(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function makeEvent(input: {
  sequence: number;
  eventType: string;
  stage: FcRunStatus;
  summary: string;
  evidenceClass: FcEvidenceClass;
  occurredAt?: string;
  durationMs?: number | null;
  checkpointHash?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}): FcRunEvent {
  if (input.summary.length > 240) {
    throw new Error("FC run event summaries must be 240 characters or fewer.");
  }
  return {
    sequence: input.sequence,
    eventType: input.eventType,
    stage: input.stage,
    summary: input.summary,
    evidenceClass: input.evidenceClass,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    durationMs: input.durationMs ?? null,
    checkpointHash: input.checkpointHash ?? null,
    metadata: input.metadata ?? {},
  };
}

export function demonstrationResult(): FcResult {
  return {
    predictedCtrPercent: 2.84,
    confidencePercent: 91,
    recommendation:
      "Move the brand reveal into the first two seconds and preserve the high-contrast product frame.",
    source: "demonstration_fixture",
    modelVersion: null,
    processingSeconds: null,
  };
}

export function isExpired(run: Pick<FcRunRecord, "expiresAt">, now = Date.now()) {
  return Date.parse(run.expiresAt) <= now;
}
