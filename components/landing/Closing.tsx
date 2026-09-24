import Link from "next/link";
import { DopaMark, GitHubMark } from "./icons";
import { DOPA_REPO_URL } from "./links";

const useCases = [
  {
    title: "Pre-spend review",
    body: "Use a model estimate and cortical playback as additional evidence before committing campaign budget.",
  },
  {
    title: "Campaign context",
    body: "Keep business profiles, products, keyword ideas, and competitor research organized by workspace.",
  },
  {
    title: "Closed-loop ops",
    body: "Compare predicted vs live CTR and review auto-pause alerts without leaving the same workspace.",
  },
];

export function Testimonials() {
  return (
    <section id="customers" className="border-t border-white/6">
      <div className="mx-auto max-w-300 px-5 py-24 md:px-8 md:py-28">
        <h2 className="text-[28px] font-medium tracking-[-0.02em] md:text-[32px]">
          Built for evidence-led creative review
        </h2>
        <div className="grid gap-10 md:grid-cols-3">
          {useCases.map((useCase) => (
            <article key={useCase.title} className="mt-10">
              <h3 className="text-[17px] font-medium tracking-[-0.01em]">
                {useCase.title}
              </h3>
              <p className="mt-3 text-[14px] leading-6 text-secondary">
                {useCase.body}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-16 max-w-130 text-[16px] leading-7 text-secondary">
          Predictions are estimates for review, not guarantees of live campaign
          performance.
        </p>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="border-t border-white/6">
      <div className="relative mx-auto max-w-300 overflow-hidden px-5 py-28 text-center md:px-8 md:py-36">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(94,106,210,0.16),transparent_60%)]" />
        <h2 className="relative text-[36px] font-medium tracking-[-0.03em] md:text-[48px]">
          Dopa is discontinued.
          <br />
          The code is open source.
        </h2>
        <p className="relative mx-auto mt-5 max-w-120 text-[15px] leading-6 text-secondary">
          We are no longer actively developing Dopa. The full source is
          available on GitHub for anyone who wants to read it, run it, or
          build on it.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={DOPA_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-[14px] font-medium text-[#08090a] transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.97]"
          >
            <GitHubMark className="h-4 w-4" />
            View on GitHub
          </a>
          <Link
            href="/demo"
            className="inline-flex h-10 items-center rounded-lg border border-white/10 px-4 text-[14px] text-foreground transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/4 active:scale-[0.97]"
          >
            Try brand import demo
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/6 bg-[#08090a]">
      <div className="mx-auto flex max-w-300 flex-col md:flex-row items-center justify-between gap-6 px-5 py-8 md:px-8">
        <div className="flex items-center gap-2 text-foreground">
          <DopaMark className="h-4 w-4 text-white" />
          <span className="text-[14px] font-medium text-white">Dopa</span>
          <span className="text-[12px] text-tertiary ml-2">© {new Date().getFullYear()} Dopa, Inc.</span>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-[13px] text-secondary">
          <Link href="/demo" className="font-medium text-white transition-colors hover:text-white/80">
            Demo
          </Link>
          <a
            href={DOPA_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <GitHubMark className="h-3.5 w-3.5" />
            GitHub
          </a>
          <Link href="/fc-proof" className="transition-colors hover:text-white">
            Judges / Alibaba Cloud proof
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
          <Link href="/terms" className="transition-colors hover:text-white">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
