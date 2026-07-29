import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Sandbox, type SandboxInfo } from "e2b";
import { getFcServerConfig } from "@/lib/fc-sandbox/config";
import { demonstrationResult } from "@/lib/fc-sandbox/lifecycle";
import {
  readBoundedResponseBytes,
  readBoundedResponseText,
} from "@/utils/http-security";
import type {
  FcEvidenceClass,
  FcProviderMode,
  FcResult,
} from "@/lib/fc-sandbox/types";

type ProviderContext = {
  runId: string;
  traceId: string;
  checkpointHash: string;
};

type SandboxReference = {
  sandboxId: string;
  state: string;
  durationMs: number;
  hibernationMode?: "deep" | "light";
  sessionId?: string;
  dynamicMountId?: string;
  snapshotId?: string;
};

type ResumeResult = SandboxReference & {
  checkpointHash: string;
  dynamicMountDigest?: string;
  wakeLatencyMs: number;
};

const CHECKPOINT_PATH = "/tmp/dopa/checkpoint.json";
const CREATIVE_PATH = "/tmp/dopa/creative.mp4";
const PROCESS_PID_PATH = "/tmp/dopa/continuity.pid";
const MAX_CREATIVE_BYTES = 25 * 1024 * 1024;
const MAX_SCORE_BYTES = 1024 * 1024;
const MAX_AUTH_RESPONSE_BYTES = 64 * 1024;
const MAX_GATEWAY_RESPONSE_BYTES = 256 * 1024;

export interface FcSandboxProvider {
  mode: FcProviderMode;
  evidenceClass: FcEvidenceClass;
  create(context: ProviderContext): Promise<SandboxReference>;
  validate(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<{ durationMs: number }>;
  pause(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<SandboxReference>;
  resume(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<ResumeResult>;
  score(context: ProviderContext, sandboxId: string): Promise<{
    result: FcResult;
    durationMs: number;
  }>;
  stop(context: ProviderContext, sandboxId: string): Promise<void>;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("AgentRun gateway returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: unknown,
  field: string,
  maximumLength = 500,
) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength
  ) {
    throw new Error(`AgentRun gateway response is missing ${field}.`);
  }
  return value;
}

function boundedNumber(value: unknown, field: string, maximum: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new Error(`AgentRun gateway response has an invalid ${field}.`);
  }
  return Math.round(value);
}

function boundedDecimal(value: unknown, field: string, maximum: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new Error(`AgentRun gateway response has an invalid ${field}.`);
  }
  return value;
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function optionalString(value: unknown, maximumLength = 500) {
  return typeof value === "string" &&
    value.trim() &&
    value.length <= maximumLength
    ? value
    : null;
}

function sessionIdFromInfo(info: SandboxInfo) {
  const direct = optionalString(info.metadata.fcSessionID, 200);
  if (direct) return direct;
  const details = optionalString(info.metadata.fcSessionDetails, 4_000);
  if (!details) return undefined;
  try {
    const parsed = JSON.parse(details) as { sessionId?: unknown };
    return optionalString(parsed.sessionId, 200) ?? undefined;
  } catch {
    return undefined;
  }
}

function recommendationFor(score: number) {
  if (score >= 3) {
    return "Strong predicted response. Move this creative into a controlled media test.";
  }
  if (score >= 1.5) {
    return "Promising signal. Test with a bounded budget and monitor the first spend window.";
  }
  return "Revise the opening seconds and product framing before committing media spend.";
}

async function scoringBearerToken() {
  const config = getFcServerConfig();
  if (config.scoringToken) return config.scoringToken;
  const { supabaseUrl, publishableKey, email, password } =
    config.scoringIdentity;
  if (!supabaseUrl || !publishableKey || !email || !password) {
    throw new Error("The private TRIBE scoring identity is not configured.");
  }
  const response = await fetch(
    new URL("/auth/v1/token?grant_type=password", `${supabaseUrl}/`),
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = await readBoundedResponseText(
    response,
    MAX_AUTH_RESPONSE_BYTES,
    "The scoring identity response exceeded the safe limit.",
  );
  if (!response.ok) {
    throw new Error("The private TRIBE scoring identity was rejected.");
  }
  return requiredString(
    parseObject(JSON.parse(body)).access_token,
    "access_token",
    8_192,
  );
}

class LocalDemonstrationProvider implements FcSandboxProvider {
  mode = "local" as const;
  evidenceClass = "local_demonstration" as const;

  async create(): Promise<SandboxReference> {
    return {
      sandboxId: `local-${randomUUID()}`,
      state: "RUNNING",
      durationMs: 0,
    };
  }

  async validate(): Promise<{ durationMs: number }> {
    return { durationMs: 0 };
  }

  async pause(): Promise<SandboxReference> {
    return {
      sandboxId: "local",
      state: "PAUSED_DEMONSTRATION",
      durationMs: 0,
    };
  }

  async resume(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<ResumeResult> {
    return {
      sandboxId,
      state: "RUNNING",
      checkpointHash: context.checkpointHash,
      wakeLatencyMs: 0,
      durationMs: 0,
    };
  }

  async score(): Promise<{ result: FcResult; durationMs: number }> {
    return { result: demonstrationResult(), durationMs: 0 };
  }

  async stop(): Promise<void> {}
}

class FcE2BProvider implements FcSandboxProvider {
  mode = "agentrun" as const;
  evidenceClass = "verified_cloud" as const;

  private connection() {
    const config = getFcServerConfig().agentRun;
    if (!config.apiKey || !config.apiUrl || !config.domain) {
      throw new Error("FC E2B connection configuration is incomplete.");
    }
    return {
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      domain: config.domain,
      requestTimeoutMs: 30_000,
    };
  }

  private template() {
    const template = getFcServerConfig().agentRun.templateName;
    if (!template) throw new Error("FC Sandbox template is not configured.");
    return template;
  }

  private async connect(sandboxId: string) {
    return Sandbox.connect(sandboxId, {
      ...this.connection(),
      timeoutMs: 60 * 60 * 1_000,
    });
  }

  private async loadCreative() {
    const creativeUrl = getFcServerConfig().demoCreativeUrl;
    if (!creativeUrl) throw new Error("The demo creative URL is not configured.");
    const response = await fetch(creativeUrl, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`The demo creative could not be loaded (${response.status}).`);
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0];
    if (contentType !== "video/mp4") {
      await response.body?.cancel();
      throw new Error("The demo creative response was not a bounded MP4.");
    }
    const data = await readBoundedResponseBytes(
      response,
      MAX_CREATIVE_BYTES,
      "The demo creative size is outside the allowed range.",
    );
    if (data.byteLength === 0) {
      throw new Error("The demo creative size is outside the allowed range.");
    }
    return data;
  }

  async create(context: ProviderContext): Promise<SandboxReference> {
    const started = Date.now();
    const sandbox = await Sandbox.create(this.template(), {
      ...this.connection(),
      timeoutMs: 60 * 60 * 1_000,
      secure: true,
      allowInternetAccess: false,
      metadata: {
        application: "dopa",
        runId: context.runId,
        traceId: context.traceId,
      },
    });
    const info = await sandbox.getInfo();
    if (info.state !== "running") {
      await sandbox.kill().catch(() => undefined);
      throw new Error(`FC Sandbox entered unexpected state ${info.state}.`);
    }
    return {
      sandboxId: sandbox.sandboxId,
      state: "RUNNING",
      durationMs: Date.now() - started,
      sessionId: sessionIdFromInfo(info),
      dynamicMountId: info.volumeMounts?.at(0)?.name,
    };
  }

  async validate(context: ProviderContext, sandboxId: string) {
    const started = Date.now();
    const sandbox = await this.connect(sandboxId);
    const creative = await this.loadCreative();
    const creativeHash = sha256(creative);
    const checkpoint = JSON.stringify({
      version: 1,
      runId: context.runId,
      traceId: context.traceId,
      checkpointHash: context.checkpointHash,
      creativeHash,
    });
    const prepared = await sandbox.commands.run("mkdir -p /tmp/dopa", {
      timeoutMs: 10_000,
    });
    if (prepared.exitCode !== 0) {
      throw new Error("FC Sandbox validation directory could not be prepared.");
    }
    const creativeBuffer = new ArrayBuffer(creative.byteLength);
    new Uint8Array(creativeBuffer).set(creative);
    await sandbox.files.write(CREATIVE_PATH, creativeBuffer);
    await sandbox.files.write(CHECKPOINT_PATH, checkpoint);
    const process = await sandbox.commands.run(
      [
        "nohup sh -c 'while true; do date +%s > /tmp/dopa/continuity.tick; sleep 1; done' >/tmp/dopa/continuity.log 2>&1 &",
        `echo $! > ${PROCESS_PID_PATH}`,
        `test -s ${CREATIVE_PATH}`,
        `test -s ${CHECKPOINT_PATH}`,
      ].join("\n"),
      { timeoutMs: 15_000 },
    );
    if (process.exitCode !== 0) {
      throw new Error("FC Sandbox validation process did not start.");
    }
    return { durationMs: Date.now() - started };
  }

  async pause(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<SandboxReference> {
    const started = Date.now();
    const sandbox = await this.connect(sandboxId);
    const checkpoint = await sandbox.files.read(CHECKPOINT_PATH);
    if (!checkpoint.includes(context.checkpointHash)) {
      throw new Error("FC Sandbox checkpoint changed before pause.");
    }
    const hibernationMode = getFcServerConfig().hibernationMode;
    await sandbox.pause({ keepMemory: hibernationMode === "light" });
    const info = await Sandbox.getInfo(sandboxId, {
      apiKey: this.connection().apiKey,
      domain: this.connection().domain,
      requestTimeoutMs: 30_000,
    });
    if (info.state !== "paused") {
      throw new Error(`FC Sandbox did not confirm paused; received ${info.state}.`);
    }
    return {
      sandboxId,
      state: "PAUSED",
      durationMs: Date.now() - started,
      hibernationMode,
    };
  }

  async resume(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<ResumeResult> {
    const started = Date.now();
    const sandbox = await this.connect(sandboxId);
    const hibernationMode = getFcServerConfig().hibernationMode;
    const [checkpointText, creative, health] = await Promise.all([
      sandbox.files.read(CHECKPOINT_PATH),
      sandbox.files.read(CREATIVE_PATH, { format: "bytes" }),
      sandbox.commands.run(
        [
          `test -s ${CHECKPOINT_PATH}`,
          `test -s ${CREATIVE_PATH}`,
          hibernationMode === "light"
            ? `test -s ${PROCESS_PID_PATH} && kill -0 $(cat ${PROCESS_PID_PATH})`
            : "python3 -c 'print(\"resume-health-ok\")'",
        ].join("\n"),
        { timeoutMs: 10_000 },
      ),
    ]);
    const checkpoint = parseObject(JSON.parse(checkpointText));
    const creativeHash = requiredString(
      checkpoint.creativeHash,
      "creativeHash",
      128,
    );
    if (
      checkpoint.checkpointHash !== context.checkpointHash ||
      sha256(creative) !== creativeHash ||
      health.exitCode !== 0
    ) {
      throw new Error("FC Sandbox continuity check failed after resume.");
    }
    const info = await sandbox.getInfo();
    if (info.state !== "running") {
      throw new Error(`FC Sandbox resumed into unexpected state ${info.state}.`);
    }
    const durationMs = Date.now() - started;
    return {
      sandboxId,
      state: "RUNNING",
      checkpointHash: context.checkpointHash,
      wakeLatencyMs: durationMs,
      durationMs,
    };
  }

  async score(context: ProviderContext, sandboxId: string) {
    const started = Date.now();
    const config = getFcServerConfig();
    if (!config.scoringUrl) {
      throw new Error("The private TRIBE scoring endpoint is not configured.");
    }
    const sandbox = await this.connect(sandboxId);
    const checkpoint = parseObject(
      JSON.parse(await sandbox.files.read(CHECKPOINT_PATH)),
    );
    if (checkpoint.checkpointHash !== context.checkpointHash) {
      throw new Error("FC Sandbox checkpoint changed before scoring.");
    }
    const creative = await sandbox.files.read(CREATIVE_PATH, {
      format: "bytes",
    });
    const form = new FormData();
    const creativeBuffer = Uint8Array.from(creative).buffer;
    form.append(
      "file",
      new Blob([creativeBuffer], { type: "video/mp4" }),
      "dopa.mp4",
    );
    const scoreUrl = new URL("/v1/score", config.scoringUrl);
    const bearerToken = await scoringBearerToken();
    const response = await fetch(scoreUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearerToken}` },
      body: form,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8 * 60 * 1_000),
    });
    const body = await readBoundedResponseText(
      response,
      MAX_SCORE_BYTES,
      "TRIBE scoring response exceeded the safe size limit.",
    );
    if (!response.ok) {
      throw new Error(`TRIBE scoring failed with ${response.status}.`);
    }
    const data = parseObject(JSON.parse(body));
    if (data.metric !== "predicted_average_ctr") {
      throw new Error("TRIBE scoring response used an unexpected metric.");
    }
    const predictedCtrPercent = boundedDecimal(
      data.score_percent,
      "score_percent",
      100,
    );
    const processingSeconds = boundedDecimal(
      data.processing_seconds,
      "processing_seconds",
      600,
    );
    const modelVersion = requiredString(data.model_version, "model_version", 200);
    return {
      result: {
        predictedCtrPercent,
        confidencePercent: null,
        recommendation: recommendationFor(predictedCtrPercent),
        source: "tribe_v2" as const,
        modelVersion,
        processingSeconds,
      },
      durationMs: Date.now() - started,
    };
  }

  async stop(_context: ProviderContext, sandboxId: string) {
    await Sandbox.kill(sandboxId, {
      apiKey: this.connection().apiKey,
      domain: this.connection().domain,
      requestTimeoutMs: 30_000,
    });
  }
}

class AgentRunGatewayProvider implements FcSandboxProvider {
  mode = "agentrun" as const;
  evidenceClass = "verified_cloud" as const;

  private async request(
    path: string,
    body: Record<string, unknown>,
    timeoutMs = 30_000,
  ) {
    const config = getFcServerConfig();
    const { gatewayUrl, gatewayToken, accountId, templateName } =
      config.agentRun;
    if (!gatewayUrl || !gatewayToken || !accountId || !templateName) {
      throw new Error("AgentRun lifecycle configuration is incomplete.");
    }
    const retryable = new Set([408, 429, 500, 502, 503, 504]);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(`${gatewayUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
            "X-Acs-Parent-Id": accountId,
            "X-Dopa-Idempotency-Key": `${String(body.runId)}:${path}`,
          },
          body: JSON.stringify({ ...body, templateName }),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.ok) {
          return parseObject(
            JSON.parse(
              await readBoundedResponseText(
                response,
                MAX_GATEWAY_RESPONSE_BYTES,
                "AgentRun gateway response exceeded the safe size limit.",
              ),
            ),
          );
        }
        await response.body?.cancel();
        if (!retryable.has(response.status) || attempt === 2) {
          throw new Error(
            `AgentRun lifecycle request failed with ${response.status}.`,
          );
        }
      } catch (error) {
        if (attempt === 2) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("AgentRun lifecycle request exhausted its retry budget.");
  }

  async create(context: ProviderContext): Promise<SandboxReference> {
    const started = Date.now();
    const data = await this.request("/v1/sandboxes", {
      runId: context.runId,
      traceId: context.traceId,
      idleTimeoutSeconds: 300,
    });
    const state = requiredString(data.state, "state", 80);
    if (state !== "READY" && state !== "RUNNING") {
      throw new Error(`AgentRun sandbox entered unexpected state ${state}.`);
    }
    return {
      sandboxId: requiredString(data.sandboxId, "sandboxId"),
      state,
      durationMs: Date.now() - started,
      sessionId: requiredString(data.sessionId, "sessionId", 200),
      dynamicMountId: requiredString(
        data.dynamicMountId,
        "dynamicMountId",
        200,
      ),
    };
  }

  async validate(context: ProviderContext, sandboxId: string) {
    const started = Date.now();
    await this.request(`/v1/sandboxes/${encodeURIComponent(sandboxId)}/validate`, {
      runId: context.runId,
      traceId: context.traceId,
      scenario: "retail_launch",
    });
    return { durationMs: Date.now() - started };
  }

  async pause(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<SandboxReference> {
    const started = Date.now();
    const data = await this.request(
      `/v1/sandboxes/${encodeURIComponent(sandboxId)}/pause`,
      {
        runId: context.runId,
        traceId: context.traceId,
        checkpointHash: context.checkpointHash,
      },
    );
    const state = requiredString(data.state, "state", 80);
    if (state !== "PAUSED") {
      throw new Error(`AgentRun did not confirm PAUSED; received ${state}.`);
    }
    return {
      sandboxId,
      state,
      durationMs: Date.now() - started,
      snapshotId: requiredString(data.snapshotId, "snapshotId", 200),
    };
  }

  async resume(
    context: ProviderContext,
    sandboxId: string,
  ): Promise<ResumeResult> {
    const started = Date.now();
    const data = await this.request(
      `/v1/sandboxes/${encodeURIComponent(sandboxId)}/resume`,
      {
        runId: context.runId,
        traceId: context.traceId,
        checkpointHash: context.checkpointHash,
      },
      60_000,
    );
    const durationMs = Date.now() - started;
    const state = requiredString(data.state, "state", 80);
    if (state !== "READY" && state !== "RUNNING") {
      throw new Error(`AgentRun did not resume to READY; received ${state}.`);
    }
    return {
      sandboxId,
      state,
      checkpointHash: requiredString(data.checkpointHash, "checkpointHash", 128),
      dynamicMountDigest: requiredString(
        data.dynamicMountDigest,
        "dynamicMountDigest",
        128,
      ),
      wakeLatencyMs:
        data.wakeLatencyMs === undefined
          ? durationMs
          : boundedNumber(data.wakeLatencyMs, "wakeLatencyMs", 300_000),
      durationMs,
    };
  }

  async score(context: ProviderContext, sandboxId: string) {
    const started = Date.now();
    const scoringTarget = getFcServerConfig().scoringUrl;
    if (!scoringTarget) {
      throw new Error("The private TRIBE scoring endpoint is not configured.");
    }
    const data = await this.request(
      `/v1/sandboxes/${encodeURIComponent(sandboxId)}/score`,
      {
        runId: context.runId,
        traceId: context.traceId,
        scenario: "retail_launch",
        scoringTarget,
      },
      120_000,
    );
    const predictedCtrPercent =
      typeof data.predictedCtrPercent === "number" &&
      Number.isFinite(data.predictedCtrPercent) &&
      data.predictedCtrPercent >= 0 &&
      data.predictedCtrPercent <= 100
        ? data.predictedCtrPercent
        : (() => {
            throw new Error(
              "AgentRun gateway response has an invalid predictedCtrPercent.",
            );
          })();
    const confidencePercent = boundedNumber(
      data.confidencePercent,
      "confidencePercent",
      100,
    );
    return {
      result: {
        predictedCtrPercent,
        confidencePercent,
        recommendation: requiredString(data.recommendation, "recommendation", 500),
        source: "tribe_v2" as const,
        modelVersion: optionalString(data.modelVersion, 200),
        processingSeconds:
          data.processingSeconds === undefined
            ? null
            : boundedNumber(
                data.processingSeconds,
                "processingSeconds",
                600,
              ),
      },
      durationMs: Date.now() - started,
    };
  }

  async stop(context: ProviderContext, sandboxId: string) {
    await this.request(
      `/v1/sandboxes/${encodeURIComponent(sandboxId)}/stop`,
      { runId: context.runId, traceId: context.traceId },
      30_000,
    );
  }
}

export function getFcSandboxProvider(): FcSandboxProvider {
  const config = getFcServerConfig();
  if (config.providerMode !== "agentrun") {
    return new LocalDemonstrationProvider();
  }
  return config.agentRun.apiKey &&
    config.agentRun.apiUrl &&
    config.agentRun.domain
    ? new FcE2BProvider()
    : new AgentRunGatewayProvider();
}
