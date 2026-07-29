"use client";

import Link from "next/link";
import { DopaMark } from "@/components/landing/icons";

const nav = [
  { label: "Features", href: "/#pipeline" },
  { label: "Demo", href: "/demo" },
  { label: "FC proof", href: "/fc-proof" },
  { label: "Privacy", href: "/privacy" },
];

export function DemoHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-50 border-b border-white/6 bg-[#070809]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-300 items-center justify-between px-5 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-white"
          aria-label="Dopa"
        >
          <DopaMark className="h-4.5 w-4.5" />
          <span className="text-[15px] font-[510] tracking-[-0.01em]">Dopa</span>
        </Link>

        <div className="flex items-center gap-1">
          <nav className="mr-2 hidden items-center lg:flex" aria-label="Primary">
            {nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[13px] text-[#b4bcd0] transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mx-2 hidden h-4 w-px bg-white/10 lg:block" />

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="px-2.5 py-1.5 text-[13px] text-[#b4bcd0] transition-colors hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/?modal=login&redirectTo=%2Fdashboard"
              className="inline-flex h-7.5 items-center rounded-full border border-white/15 bg-white/4 px-3.5 text-[13px] text-white transition-colors hover:bg-white/8"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
