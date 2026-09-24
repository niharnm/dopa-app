import Link from "next/link";
import { ArrowRight, GitHubMark } from "./icons";
import { HeroIssueDemo } from "./HeroIssueDemo";
import { DOPA_REPO_URL } from "./links";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(ellipse_at_50%_20%,rgba(88,92,140,0.22),transparent_58%)]" />

      <div className="relative mx-auto max-w-300 px-5 md:px-8">
        <div className="max-w-205 pb-10 pt-16 md:pb-14 md:pt-22">
          <a
            href={DOPA_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="animate-fade-up mb-7 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-white/10 bg-white/4 px-3.5 py-1.5 text-[13px] leading-5 text-[#b4bcd0] transition-colors hover:bg-white/8 hover:text-white"
          >
            <span>
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#f2994a] align-middle" aria-hidden />
              Dopa has been discontinued. The code is now open source.
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-white">
              <GitHubMark className="h-3.5 w-3.5" />
              View on GitHub
              <ArrowRight className="h-3 w-3 opacity-70" />
            </span>
          </a>
          <h1 className="animate-fade-up text-[40px] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[52px] md:text-[64px]">
            Pre-spend creative intelligence
            <br />
            for marketing teams
          </h1>

          <div className="animate-fade-up-delay mt-6 flex flex-col gap-5 sm:mt-7 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <p className="max-w-105 text-[15px] leading-6 text-[#8a8f98] md:text-[16px] md:leading-7">
              Upload an ad, predict its average click-through rate, and inspect
              the cortical response modeled by TRIBE v2.
            </p>

            <div className="flex shrink-0 flex-wrap items-center gap-3 self-start sm:self-auto">
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[14px] font-medium text-[#08090a] transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.97]"
              >
                Try brand import demo
                <ArrowRight className="h-3.5 w-3.5 opacity-70" />
              </Link>
              <Link
                href="/?modal=signup"
                className="inline-flex items-center rounded-lg border border-white/10 px-4 py-2.5 text-[14px] text-[#c7cad1] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/4 hover:text-white active:scale-[0.97]"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>

        <div className="animate-fade-up-delay-2 relative">
          <HeroIssueDemo />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-[#08090a] to-transparent md:h-40" />
        </div>
      </div>
    </section>
  );
}
