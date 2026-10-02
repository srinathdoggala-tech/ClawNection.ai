"use client";

import { FormEvent, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhoneShell } from "@/components/PhoneShell";
import { ONBOARDING_HREF } from "@/lib/featureFlags";

export default function SignInPage() {
  const router = useRouter();

  useEffect(() => {
    document.title = "Sign in · Clawnection";
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(ONBOARDING_HREF);
  }

  return (
    <PhoneShell>
      <main className="screen-padding flex min-h-dvh flex-col justify-between gap-10">
        <section aria-labelledby="signin-title" className="space-y-8">
          <header className="space-y-4 pt-3">
            <Link
              href="/"
              className="pill w-fit"
              aria-label="Return to the Clawnection home screen"
            >
              Clawnection
            </Link>
            <div className="space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-white/45">
                Secure sign in
              </p>
              <h1 id="signin-title" className="text-4xl font-black leading-tight tracking-[-0.04em]">
                Get back in the game.
              </h1>
              <p className="max-w-sm text-base leading-7 text-white/68">
                Sign in to continue building your dating agent, reviewing matches,
                and deciding which introductions feel right.
              </p>
            </div>
          </header>

          <form className="obsidian-card liquid-glass space-y-5 rounded-[2rem] p-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-bold text-white/86">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="field"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-bold text-white/86">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                className="field"
                placeholder="At least 8 characters"
              />
            </div>

            <div className="flex items-center justify-between gap-4 text-sm">
              <label className="flex items-center gap-2 text-white/66">
                <input
                  type="checkbox"
                  name="remember"
                  className="h-4 w-4 rounded border-white/20 bg-white/10 accent-[var(--color-interactive)]"
                />
                Keep me signed in
              </label>
              <Link href="/sign-in" className="font-bold text-[var(--color-interactive)]">
                Reset password
              </Link>
            </div>

            <button type="submit" className="primary-button w-full">
              Sign in with email
            </button>

            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-white/12" />
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/36">or</span>
              <span className="h-px flex-1 bg-white/12" />
            </div>

            <button
              type="button"
              className="apple-sign-in-button"
              aria-label="Sign in with Apple"
              onClick={() => router.push(ONBOARDING_HREF)}
            >
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 14 17"
                className="apple-glyph"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M11.6233 8.91328C11.6062 6.9707 13.2155 6.0293 13.2862 5.98438C12.3754 4.65625 10.9568 4.47461 10.4519 4.45508C9.25147 4.33008 8.10303 5.16602 7.49561 5.16602C6.87646 5.16602 5.94287 4.46875 4.93653 4.48828C3.62037 4.50781 2.39115 5.26953 1.71291 6.45117C0.337891 8.83594 1.36475 12.3535 2.69584 14.291C3.35303 15.2422 4.12451 16.3047 5.13428 16.2676C6.11846 16.2266 6.49072 15.6328 7.68018 15.6328C8.85791 15.6328 9.20654 16.2676 10.2393 16.2461C11.2998 16.2266 11.9658 15.2734 12.6035 14.3164C13.3613 13.2148 13.6748 12.1387 13.6904 12.0879C13.665 12.0801 11.6428 11.293 11.6233 8.91328Z" />
                <path d="M9.69189 3.16797C10.2207 2.50781 10.5849 1.61133 10.4853 0.703125C9.71728 0.736328 8.74435 1.21484 8.19581 1.86133C7.71045 2.43164 7.27276 3.36719 7.38525 4.24414C8.24902 4.30859 9.14014 3.81836 9.69189 3.16797Z" />
              </svg>
              <span>Sign in with Apple</span>
            </button>
          </form>
        </section>

        <section aria-labelledby="signin-privacy" className="liquid-glass rounded-3xl p-4">
          <h2 id="signin-privacy" className="text-base font-extrabold">
            Privacy by default
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/58">
            Your agent can recommend introductions, but people make the final choice.
            If you need reasonable accommodations for access, contact support before a date is scheduled.
          </p>
        </section>
      </main>
    </PhoneShell>
  );
}
