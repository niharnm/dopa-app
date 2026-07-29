import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoHeader } from "@/components/demo/DemoHeader";
import { FcSandboxDemo } from "@/components/demo/FcSandboxDemo";
import { getFcProof } from "@/lib/fc-sandbox/service";

export const metadata: Metadata = {
  title: "FC Sandbox proof demo — Dopa",
  description:
    "Run Dopa's approval-gated creative scoring lifecycle and inspect its AgentRun evidence.",
};

export default async function DemoPage() {
  await connection();
  const proof = await getFcProof();

  return (
    <main
      id="fc-sandbox-surface"
      className="relative min-h-screen overflow-hidden bg-[#070809] text-white"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 dopa-grain" />
      <div className="pointer-events-none absolute left-1/2 top-[-28rem] h-180 w-180 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(105,91,255,0.15),transparent_66%)]" />
      <DemoHeader />
      <FcSandboxDemo initialProof={proof} />
    </main>
  );
}
