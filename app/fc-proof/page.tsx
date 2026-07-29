import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DemoHeader } from "@/components/demo/DemoHeader";
import { FcProofLedger } from "@/components/demo/FcProofLedger";
import { getFcProof } from "@/lib/fc-sandbox/service";

export const metadata: Metadata = {
  title: "FC Sandbox evidence ledger — Dopa",
  description:
    "A truthful, source-linked capability ledger for Dopa's Alibaba Cloud FC Sandbox integration.",
};

const implementationMap = [
  {
    layer: "Judge surface",
    proof: "Anonymous golden-path demo, trace spine, exact evidence labels",
    source: "/demo",
  },
  {
    layer: "Lifecycle API",
    proof: "Bounded routes, stale-approval protection, signed callbacks",
    source: "app/api/fc-demo",
  },
  {
    layer: "Orchestrator",
    proof: "Explicit state machine and checkpoint continuity gate",
    source: "lib/fc-sandbox/service.ts",
  },
  {
    layer: "AgentRun adapter",
    proof: "Server-only create, validate, pause, resume, score, and stop",
    source: "lib/fc-sandbox/provider.ts",
  },
  {
    layer: "Durable state",
    proof: "RLS-protected run, event, and evidence records",
    source: "supabase/migrations",
  },
  {
    layer: "Reproduction",
    proof: "Deployment contract, evidence harness, failure drills, demo script",
    source: "docs/fc-sandbox",
  },
];

export default async function FcProofPage() {
  await connection();
  const proof = await getFcProof();

  return (
    <main
      id="fc-sandbox-surface"
      className="relative min-h-screen overflow-hidden bg-[#070809] text-white"
    >
      <div className="pointer-events-none absolute inset-0 opacity-35 dopa-grain" />
      <DemoHeader />
      <div className="relative mx-auto max-w-300 px-5 pb-24 pt-32 md:px-8">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8f86ff]">
            Evidence ledger / FC Sandbox
          </p>
          <h1 className="mt-5 text-balance text-4xl font-[510] tracking-[-0.045em] sm:text-6xl">
            Claims are cheap. This page separates implementation from proof.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#a2a8b4]">
            A capability becomes verified only after a signed live harness run
            stores its source digest and observation time. Configuration alone
            never receives a green badge.
          </p>
        </div>

        <section className="mt-12">
          <FcProofLedger proof={proof} expanded />
        </section>

        <section className="mt-14 border-t border-white/10 pt-10">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#747b89]">
                Implementation map
              </p>
              <h2 className="mt-3 text-2xl tracking-[-0.03em]">
                From browser intent to isolated compute
              </h2>
            </div>
            <Link
              href="/demo"
              className="text-sm text-[#a9a2ff] transition-colors hover:text-white"
            >
              Run the golden path →
            </Link>
          </div>

          <div className="mt-7 divide-y divide-white/8 border-y border-white/8">
            {implementationMap.map((item, index) => (
              <div
                key={item.layer}
                className="grid gap-2 py-5 md:grid-cols-[48px_180px_1fr_220px] md:items-center"
              >
                <span className="font-mono text-[10px] text-[#5f6570]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-sm text-white">{item.layer}</h3>
                <p className="text-sm text-[#8d94a1]">{item.proof}</p>
                <code className="truncate font-mono text-[11px] text-[#777f8d]">
                  {item.source}
                </code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
