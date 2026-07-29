"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FcProofLedger } from "@/components/demo/FcProofLedger";
import type {
  FcCapabilityEvidence,
  FcPublicRun,
  FcReadiness,
  FcRunAccess,
  FcRunEvent,
  FcRunStatus,
} from "@/lib/fc-sandbox/types";

type Proof = {
  readiness: FcReadiness;
  capabilities: FcCapabilityEvidence[];
};

type StoredAccess = {
  runId: string;
  accessToken: string;
  approvalNonce: string;
};

const STORAGE_KEY = "dopa-fc-demo-access-v1";

const stageOrder: Array<{
  id: FcRunStatus;
  label: string;
  short: string;
}> = [
  { id: "created", label: "Run accepted", short: "accept" },
  { id: "provisioning", label: "Sandbox provisioned", short: "create" },
  { id: "validating", label: "Sandbox validates input", short: "validate" },
  { id: "awaiting_approval", label: "Approval checkpoint", short: "checkpoint" },
  { id: "hibernated", label: "Compute hibernated", short: "hibernate" },
  { id: "resuming", label: "State restored", short: "resume" },
  { id: "scoring", label: "TRIBE v2 inference", short: "score" },
  { id: "completed", label: "Result committed", short: "complete" },
];

function statusIndex(status: FcRunStatus) {
  if (status === "pausing") return 3;
  if (status === "failed") return -1;
  return stageOrder.findIndex((stage) => stage.id === status);
}

function milliseconds(value: number | null) {
  if (value === null) return "—";
  return value < 1_000 ? `${value} ms` : `${(value / 1_000).toFixed(2)} s`;
}

function elapsedFrom(timestamp: string | null, tick: number) {
  if (!timestamp) return "0.0 s";
  const elapsed = Math.max(0, tick - Date.parse(timestamp));
  return `${(elapsed / 1_000).toFixed(1)} s`;
}

function eventTone(event: FcRunEvent) {
  if (event.stage === "failed") return "bg-[#f46b79]";
  if (event.stage === "hibernated") return "bg-[#f2b84b]";
  if (event.evidenceClass === "verified_cloud") return "bg-[#3fd1a4]";
  return "bg-[#8f86ff]";
}

async function responseBody(response: Response) {
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null) {
    throw new Error("The demo returned an invalid response.");
  }
  return data as Record<string, unknown>;
}

export function FcSandboxDemo({ initialProof }: { initialProof: Proof }) {
  const [proof, setProof] = useState(initialProof);
  const [run, setRun] = useState<FcPublicRun | null>(null);
  const [access, setAccess] = useState<StoredAccess | null>(null);
  const [busy, setBusy] = useState<"start" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (run?.status !== "hibernated") return;
    const timer = window.setInterval(() => setTick(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [run?.status]);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    let stored: StoredAccess | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "runId" in parsed &&
        "accessToken" in parsed &&
        "approvalNonce" in parsed &&
        typeof parsed.runId === "string" &&
        typeof parsed.accessToken === "string" &&
        typeof parsed.approvalNonce === "string"
      ) {
        stored = parsed as StoredAccess;
      }
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    if (!stored) return;
    fetch(`/api/fc-demo/runs/${encodeURIComponent(stored.runId)}`, {
      headers: { Authorization: `Bearer ${stored.accessToken}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The previous run expired.");
        const restored = (await response.json()) as FcPublicRun;
        setAccess(stored);
        setRun(restored);
      })
      .catch(() => window.sessionStorage.removeItem(STORAGE_KEY));
  }, []);

  const hibernatedFor = useMemo(
    () =>
      run?.status === "hibernated"
        ? elapsedFrom(run.timestamps.pausedAt, tick)
        : milliseconds(run?.metrics.hibernatedMs ?? null),
    [run, tick],
  );

  async function refreshProof() {
    const response = await fetch("/api/fc-demo/proof", { cache: "no-store" });
    if (response.ok) setProof((await response.json()) as Proof);
  }

  async function readRun(stored: StoredAccess) {
    const response = await fetch(
      `/api/fc-demo/runs/${encodeURIComponent(stored.runId)}`,
      {
        headers: { Authorization: `Bearer ${stored.accessToken}` },
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("The run could not be refreshed.");
    return (await response.json()) as FcPublicRun;
  }

  async function prepareRun(stored: StoredAccess) {
    let polling = true;
    const poll = async () => {
      while (polling) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        if (!polling) break;
        try {
          const next = await readRun(stored);
          setRun(next);
          if (next.status === "hibernated" || next.status === "failed") break;
        } catch {
          // The authoritative prepare response handles errors for this action.
        }
      }
    };
    const pollingTask = poll();
    try {
      const response = await fetch(
        `/api/fc-demo/runs/${encodeURIComponent(stored.runId)}/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: stored.accessToken }),
        },
      );
      const data = await responseBody(response);
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "The sandbox could not be prepared.",
        );
      }
      setRun(data as unknown as FcPublicRun);
    } finally {
      polling = false;
      await pollingTask;
    }
  }

  async function startRun() {
    setBusy("start");
    setError(null);
    try {
      const response = await fetch("/api/fc-demo/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "retail_launch" }),
      });
      const data = await responseBody(response);
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "The run could not start.",
        );
      }
      const started = data as unknown as FcRunAccess;
      const stored: StoredAccess = {
        runId: started.run.id,
        accessToken: started.accessToken,
        approvalNonce: started.approvalNonce,
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      setAccess(stored);
      setRun(started.run);
      await prepareRun(stored);
      await refreshProof();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The run could not start.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function approveRun() {
    if (!run || !access) return;
    setBusy("approve");
    setError(null);
    try {
      const response = await fetch(
        `/api/fc-demo/runs/${encodeURIComponent(run.id)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: access.accessToken,
            approvalNonce: access.approvalNonce,
          }),
        },
      );
      const data = await responseBody(response);
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "The approval could not be completed.",
        );
      }
      setRun(data as unknown as FcPublicRun);
      await refreshProof();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The approval could not be completed.",
      );
    } finally {
      setBusy(null);
    }
  }

  const activeIndex = run ? statusIndex(run.status) : -1;
  const isLocal = !run
    ? proof.readiness.mode === "local"
    : run.evidenceClass === "local_demonstration";

  return (
    <div className="relative mx-auto max-w-300 px-5 pb-24 pt-28 md:px-8 md:pt-36">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8f86ff]">
              Alibaba Cloud FC Sandbox / golden path
            </p>
            <span
              className={`rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
                isLocal
                  ? "border-[#f2b84b]/20 bg-[#f2b84b]/7 text-[#d6aa58]"
                  : "border-[#3fd1a4]/20 bg-[#3fd1a4]/7 text-[#5ed9b4]"
              }`}
            >
              {isLocal ? "demonstration · unverified" : "AgentRun · live"}
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl text-balance text-4xl font-[510] leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-[72px]">
            One creative. One sleeping sandbox. One proof trail.
          </h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-7 text-[#9da4b1]">
            Dopa validates a sample ad, checkpoints at human approval, pauses
            compute, restores the exact state, and only then calls TRIBE v2.
            Every event below states whether it is cloud evidence or a local
            demonstration.
          </p>
        </div>

        <div className="border-l border-white/10 pl-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#68707c]">
            Judge path
          </p>
          <p className="mt-3 text-sm leading-6 text-[#b1b6c0]">
            Start → inspect the paused boundary → approve once → verify the
            checkpoint digest → inspect the evidence ledger.
          </p>
          <p className="mt-3 font-mono text-[10px] text-[#626a76]">
            Typical local walkthrough: under 30 seconds
          </p>
        </div>
      </section>

      <section className="mt-12 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-2xl border border-white/9 bg-[#0c0d10]/94 shadow-[0_32px_100px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col justify-between gap-5 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-center md:px-6">
            <div className="flex items-center gap-3">
              <span
                className={`h-2 w-2 rounded-full ${
                  run?.status === "failed"
                    ? "bg-[#f46b79]"
                    : run?.status === "hibernated"
                      ? "bg-[#f2b84b] shadow-[0_0_16px_rgba(242,184,75,0.65)]"
                      : run?.status === "completed"
                        ? "bg-[#3fd1a4]"
                        : run
                          ? "bg-[#8f86ff]"
                          : "bg-[#4f5560]"
                }`}
              />
              <div>
                <p className="text-[14px] text-[#e8e9ec]">
                  {run
                    ? run.status.replaceAll("_", " ")
                    : "Ready for sample creative"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#646b77]">
                  {run
                    ? `trace ${run.traceId.slice(0, 8)} · ${run.provider}`
                    : "No sign-up · bounded sample input"}
                </p>
              </div>
            </div>

            {!run ? (
              <button
                type="button"
                onClick={startRun}
                disabled={busy !== null}
                className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-[510] text-[#0b0c0e] transition-transform hover:scale-[1.015] disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "start" ? "Creating run…" : "Start FC sandbox run"}
              </button>
            ) : run.status === "hibernated" ? (
              <button
                type="button"
                onClick={approveRun}
                disabled={busy !== null}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#7267f5] px-5 text-sm font-[510] text-white transition-colors hover:bg-[#8278ff] disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "approve" ? "Restoring state…" : "Approve & resume"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRun(null);
                  setAccess(null);
                  setError(null);
                  window.sessionStorage.removeItem(STORAGE_KEY);
                }}
                disabled={busy !== null}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 px-5 text-sm text-[#c6cad1] transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                New run
              </button>
            )}
          </div>

          {error ? (
            <div
              role="alert"
              className="border-b border-[#f46b79]/15 bg-[#f46b79]/5 px-5 py-3 text-sm text-[#f39aa3] md:px-6"
            >
              {error}
            </div>
          ) : null}

          <div className="px-5 py-7 md:px-6">
            <div className="overflow-x-auto pb-2">
              <div className="relative min-w-180">
                <div className="absolute left-4 right-4 top-3 h-px bg-white/10" />
                <div className="relative grid grid-cols-8">
                  {stageOrder.map((stage, index) => {
                    const reached = activeIndex >= index;
                    const current =
                      run?.status === stage.id ||
                      (run?.status === "pausing" &&
                        stage.id === "awaiting_approval");
                    return (
                      <div key={stage.id} className="pr-3">
                        <span
                          className={`relative block h-6 w-6 rounded-full border-4 border-[#0c0d10] ${
                            current && stage.id === "hibernated"
                              ? "bg-[#f2b84b] shadow-[0_0_18px_rgba(242,184,75,0.5)]"
                              : reached
                                ? "bg-[#8277ff]"
                                : "bg-[#292c32]"
                          }`}
                        />
                        <p
                          className={`mt-3 font-mono text-[9px] uppercase tracking-[0.1em] ${
                            reached ? "text-[#a8adb7]" : "text-[#4f5560]"
                          }`}
                        >
                          {stage.short}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-3">
              <div className="bg-[#101216] px-4 py-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#646b77]">
                  Active compute
                </p>
                <p className="mt-2 text-xl tracking-[-0.03em] text-[#e4e6e9]">
                  {milliseconds(run?.metrics.activeMs ?? null)}
                </p>
              </div>
              <div className="relative overflow-hidden bg-[#12120f] px-4 py-4">
                <div className="absolute inset-y-0 left-0 w-px bg-[#f2b84b]/35" />
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#9b8050]">
                  Hibernation gap
                </p>
                <p className="mt-2 text-xl tracking-[-0.03em] text-[#edc778]">
                  {hibernatedFor}
                </p>
              </div>
              <div className="bg-[#101216] px-4 py-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#646b77]">
                  Wake latency
                </p>
                <p className="mt-2 text-xl tracking-[-0.03em] text-[#e4e6e9]">
                  {milliseconds(run?.metrics.wakeLatencyMs ?? null)}
                </p>
              </div>
            </div>

            {run?.checkpoint.digest ? (
              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/7 bg-white/2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#646b77]">
                  Checkpoint v{run.checkpoint.version}
                </p>
                <code className="truncate font-mono text-[10px] text-[#8b92a0]">
                  sha256:{run.checkpoint.digest}
                </code>
              </div>
            ) : null}
          </div>

          <div className="border-t border-white/8">
            <div className="flex items-center justify-between px-5 py-4 md:px-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6d7480]">
                Trace spine
              </p>
              <p className="font-mono text-[9px] text-[#515762]">
                {run?.events.length ?? 0} durable events
              </p>
            </div>
            <div className="max-h-82 overflow-y-auto border-t border-white/7">
              {run?.events.length ? (
                run.events.map((event, index) => (
                  <div
                    key={`${event.sequence}-${event.eventType}`}
                    className="grid grid-cols-[28px_1fr_auto] gap-3 border-b border-white/6 px-5 py-4 last:border-0 md:px-6"
                  >
                    <div className="relative pt-1">
                      <span
                        className={`block h-2 w-2 rounded-full ${eventTone(event)}`}
                      />
                      {index < run.events.length - 1 ? (
                        <span className="absolute left-[3.5px] top-4 h-[calc(100%+8px)] w-px bg-white/7" />
                      ) : null}
                    </div>
                    <div>
                      <p className="text-[12px] text-[#c7cbd2]">
                        {event.summary}
                      </p>
                      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#5f6672]">
                        {event.eventType} ·{" "}
                        {event.evidenceClass === "verified_cloud"
                          ? "cloud evidence"
                          : "local demonstration"}
                      </p>
                    </div>
                    <span className="font-mono text-[9px] text-[#626975]">
                      {milliseconds(event.durationMs)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-sm text-[#666d78] md:px-6">
                  Start the sample to generate a trace.
                </div>
              )}
            </div>
          </div>

          {run?.result ? (
            <div className="border-t border-[#3fd1a4]/15 bg-[#3fd1a4]/4 px-5 py-6 md:px-6">
              <div className="grid gap-6 sm:grid-cols-[140px_160px_1fr]">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#759c90]">
                    Predicted CTR
                  </p>
                  <p className="mt-2 text-3xl tracking-[-0.05em]">
                    {run.result.predictedCtrPercent.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#759c90]">
                    Model
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#b8c9c4]">
                    {run.result.modelVersion ?? "Demonstration fixture"}
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#66837b]">
                    {run.result.processingSeconds === null
                      ? "Processing time not measured"
                      : `${run.result.processingSeconds.toFixed(2)}s GPU processing`}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#759c90]">
                    Recommendation
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#b8c9c4]">
                    {run.result.recommendation}
                  </p>
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#66837b]">
                    {run.result.source === "tribe_v2"
                      ? "TRIBE v2 · live result"
                      : "Illustrative fixture · not cloud verified"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <FcProofLedger proof={proof} />
          <div className="rounded-2xl border border-white/9 bg-[#0c0d10]/90 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6d7480]">
              Truth boundary
            </p>
            <p className="mt-3 text-[12px] leading-5 text-[#9097a4]">
              Purple means implemented or demonstrated. Green appears only
              after a signed live harness writes immutable evidence metadata.
              Local timing is never presented as Alibaba billing or performance.
            </p>
            <Link
              href="/fc-proof"
              className="mt-4 inline-flex text-[12px] text-[#aaa3ff] transition-colors hover:text-white"
            >
              Inspect the full evidence ledger →
            </Link>
          </div>
        </div>
      </section>

      <p className="sr-only" aria-live="polite">
        {busy === "start"
          ? "Creating, validating, and hibernating the sandbox run."
          : busy === "approve"
            ? "Restoring the checkpoint and scoring."
            : run
              ? `Run status: ${run.status}.`
              : ""}
      </p>
    </div>
  );
}
