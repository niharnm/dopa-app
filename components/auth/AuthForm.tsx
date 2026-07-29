import Link from "next/link";
import { signInWithGoogleFromForm } from "@/app/auth/actions";

type AuthFormProps = {
  mode: "login" | "signup";
  action: (formData: FormData) => Promise<void>;
  redirectTo?: string;
  error?: string;
  message?: string;
};

const inputClass =
  "h-10 w-full rounded-lg border border-white/10 bg-[#0c0d0e] px-3 text-[14px] text-white outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-tertiary hover:border-white/15 focus:border-brand focus:ring-1 focus:ring-brand/40";

const primaryButtonClass =
  "flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.16)] transition-all hover:opacity-90 active:scale-[0.99]";

const googleButtonClass =
  "flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/6 text-[14px] font-medium text-white transition-all hover:bg-white/10 active:scale-[0.99]";

export function AuthForm({
  mode,
  action,
  redirectTo,
  error,
  message,
}: AuthFormProps) {
  const isLogin = mode === "login";
  const redirectQuery = redirectTo
    ? `&redirectTo=${encodeURIComponent(redirectTo)}`
    : "";

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">
          {message}
        </p>
      ) : null}

      <form action={action} className="space-y-4">
        {redirectTo ? (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        ) : null}
        {!isLogin ? (
          <div>
            <label
              htmlFor="fullName"
              className="mb-1.5 block text-[12px] font-medium text-secondary"
            >
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              className={inputClass}
              placeholder="Your name"
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-secondary">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-secondary">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? 1 : 12}
            maxLength={128}
            className={inputClass}
            placeholder="••••••••"
          />
          {!isLogin ? (
            <p className="mt-1.5 text-[11px] text-tertiary">
              Use at least 12 characters.
            </p>
          ) : null}
        </div>
        <button type="submit" className={primaryButtonClass}>
          {isLogin ? "Log in" : "Sign up"}
          <kbd className="hidden rounded border border-white/15 bg-white/8 px-1.5 py-0.5 text-[10px] font-mono text-white/70 sm:inline">
            ↵
          </kbd>
        </button>
      </form>

      <p className="text-center text-[13px] text-secondary">
        {isLogin ? (
          <>
            Don&apos;t have an account?{" "}
            <Link
              href={`/?modal=signup${redirectQuery}`}
              className="text-white transition-opacity hover:opacity-80"
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href={`/?modal=login${redirectQuery}`}
              className="text-white transition-opacity hover:opacity-80"
            >
              Sign in
            </Link>
          </>
        )}
      </p>

      <div className="flex items-center gap-3 text-[12px] text-tertiary">
        <div className="h-px flex-1 bg-white/6" />
        <span className="whitespace-nowrap">or</span>
        <div className="h-px flex-1 bg-white/6" />
      </div>

      <form action={signInWithGoogleFromForm}>
        {redirectTo ? (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        ) : null}
        <button type="submit" className={googleButtonClass}>
          <GoogleIcon />
          Continue with Google
        </button>
      </form>

      {!isLogin ? (
        <p className="text-center text-[11px] leading-4 text-tertiary">
          By signing up, you agree to our{" "}
          <Link
            href="/terms"
            className="text-secondary underline decoration-white/30 underline-offset-2"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-secondary underline decoration-white/30 underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
