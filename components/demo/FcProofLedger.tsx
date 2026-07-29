"use client";

import type {
  FcCapabilityEvidence,
  FcReadiness,
} from "@/lib/fc-sandbox/types";

type Proof = {
  readiness: FcReadiness;
  capabilities: FcCapabilityEvidence[];
};

const statusStyle = {
  verified: "border-[#3fd1a4]/25 bg-[#3fd1a4]/8 text-[#66deb9]",
  configured: "border-[#8f86ff]/25 bg-[#8f86ff]/8 text-[#aaa3ff]",
  pending: "border-white/10 bg-white/3 text-[#777e8a]",
} as const;

export function FcProofLedger({
  proof,
  expanded = false,
}: {
  proof: Proof;
  expanded?: boolean;
}) {
  const configuredCount = proof.capabilities.filter(
    (item) => item.status === "configured",
  ).length;
  const verifiedCount = proof.capabilities.filter(
    (item) => item.status === "verified",
  ).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/9 bg-[#0c0d10]/90">
      <div className="flex flex-col justify-between gap-4 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-center md:px-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#747b89]">
            Capability evidence
          </p>
          <p className="mt-2 text-sm text-[#b6bbc5]">
            {verifiedCount} verified · {configuredCount} configured ·{" "}
            {proof.capabilities.length - verifiedCount - configuredCount} pending
          </p>
        </div>
        <div
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
            proof.readiness.mode === "agentrun"
              ? statusStyle.configured
              : statusStyle.pending
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {proof.readiness.mode === "agentrun"
            ? "AgentRun configured"
            : "Local demonstration"}
        </div>
      </div>

      <div className={expanded ? "grid lg:grid-cols-2" : ""}>
        {proof.capabilities.map((item) => (
          <article
            key={item.capability}
            className={`border-b border-white/7 px-5 py-5 last:border-b-0 md:px-6 ${
              expanded
                ? "lg:border-r lg:even:border-r-0 lg:nth-last-[-n+2]:border-b-0"
                : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[14px] text-[#e8e9ec]">{item.label}</h3>
                {expanded ? (
                  <p className="mt-2 text-[12px] leading-5 text-[#777f8d]">
                    {item.requirement}
                  </p>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${statusStyle[item.status]}`}
              >
                {item.status}
              </span>
            </div>
            {expanded ? (
              <div className="mt-4 border-l border-white/10 pl-3">
                <p className="text-[11px] leading-5 text-[#8a919e]">
                  {item.note}
                </p>
                {item.source ? (
                  <p className="mt-2 font-mono text-[10px] text-[#646b77]">
                    {item.source}
                    {item.observedAt
                      ? ` · ${new Date(item.observedAt).toLocaleString()}`
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {!proof.readiness.liveProvider ? (
        <div className="border-t border-[#f2b84b]/12 bg-[#f2b84b]/4 px-5 py-4 md:px-6">
          <p className="text-[11px] leading-5 text-[#a99062]">
            Live badges are intentionally withheld. AgentRun credentials and a
            signed evidence run are required before any provider claim is marked
            verified.
          </p>
        </div>
      ) : null}
    </div>
  );
}
