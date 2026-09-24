import Link from "next/link";
import { AuthLinks } from "@/components/auth/AuthLinks";
import { DopaMark } from "./icons";
import { DOPA_REPO_URL } from "./links";

const nav = [
  { label: "Features", href: "#pipeline" },
  { label: "Demo", href: "/demo" },
  { label: "GitHub", href: DOPA_REPO_URL, external: true },
  { label: "Privacy", href: "/privacy" },
];

export async function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-300 items-center justify-between gap-4 px-5 md:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-white"
          aria-label="Dopa"
        >
          <DopaMark className="h-4.5 w-4.5" />
          <span className="text-[15px] font-[510] tracking-[-0.01em]">Dopa</span>
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-1">
          <nav
            className="mr-1 hidden items-center sm:flex"
            aria-label="Primary"
          >
            {nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                {...(item.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="inline-flex items-center px-2.5 py-1.5 text-[13px] text-[#b4bcd0] transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mx-1.5 hidden h-4 w-px shrink-0 bg-white/10 sm:block" />

          <div className="flex shrink-0 items-center gap-1">
            <AuthLinks />
          </div>
        </div>
      </div>
    </header>
  );
}
