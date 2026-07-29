export const FC_RUN_STATUSES = [
  "created",
  "provisioning",
  "validating",
  "awaiting_approval",
  "pausing",
  "hibernated",
  "resuming",
  "scoring",
  "completed",
  "failed",
] as const;

export type FcRunStatus = (typeof FC_RUN_STATUSES)[number];
export type FcProviderMode = "agentrun" | "local";
export type FcEvidenceClass = "verified_cloud" | "local_demonstration";
export type FcCapabilityStatus = "verified" | "configured" | "pending";

export type FcResult = {
  predictedCtrPercent: number;
  confidencePercent: number | null;
  recommendation: string;
  source: "tribe_v2" | "demonstration_fixture";
  modelVersion: string | null;
  processingSeconds: number | null;
};

export type FcRunEvent = {
  sequence: number;
  eventType: string;
  stage: FcRunStatus;
  summary: string;
  evidenceClass: FcEvidenceClass;
  occurredAt: string;
  durationMs: number | null;
  checkpointHash: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type FcRunRecord = {
  id: string;
  traceId: string;
  publicTokenHash: string;
  approvalNonceHash: string;
  requestFingerprintHash: string;
  scenario: "retail_launch";
  provider: FcProviderMode;
  evidenceClass: FcEvidenceClass;
  status: FcRunStatus;
  sandboxId: string | null;
  sandboxState: string | null;
  checkpointHash: string | null;
  checkpointVersion: number;
  result: FcResult | null;
  safeErrorCode: string | null;
  requestedAt: string;
  pausedAt: string | null;
  resumedAt: string | null;
  completedAt: string | null;
  activeMs: number;
  hibernatedMs: number;
  wakeLatencyMs: number | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type FcPublicRun = {
  id: string;
  traceId: string;
  scenario: "retail_launch";
  provider: FcProviderMode;
  evidenceClass: FcEvidenceClass;
  status: FcRunStatus;
  sandbox: {
    reference: string | null;
    state: string | null;
  };
  checkpoint: {
    digest: string | null;
    version: number;
  };
  timestamps: {
    requestedAt: string;
    pausedAt: string | null;
    resumedAt: string | null;
    completedAt: string | null;
  };
  metrics: {
    activeMs: number;
    hibernatedMs: number;
    wakeLatencyMs: number | null;
  };
  result: FcResult | null;
  errorCode: string | null;
  events: FcRunEvent[];
};

export type FcRunAccess = {
  run: FcPublicRun;
  accessToken: string;
  approvalNonce: string;
};

export type FcCapabilityEvidence = {
  capability: string;
  label: string;
  requirement: string;
  status: FcCapabilityStatus;
  source: string | null;
  observedAt: string | null;
  metrics: Record<string, string | number | boolean | null>;
  note: string;
};

export type FcReadiness = {
  mode: FcProviderMode;
  durableStore: boolean;
  liveProvider: boolean;
  scoringBackend: boolean;
  callbackVerification: boolean;
  missing: string[];
};
