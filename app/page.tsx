import Link from "next/link";
import { PhoneShell } from "@/components/PhoneShell";
import { ONBOARDING_HREF } from "@/lib/featureFlags";

export default function HomePage() {
  return (
    <PhoneShell>
      <main className="screen-padding flex min-h-dvh flex-col justify-between gap-10">
        <section
          aria-labelledby="home-title"
          className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        >
          <h1
            id="home-title"
            className="text-6xl font-black tracking-[-0.05em] text-white"
          >
            claw<span className="claw-text-gradient">nection</span>
          </h1>
        </section>

        <div className="space-y-2.5">
          <Link
            href="/demo"
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#d982ab] to-[#8e58a6] hover:from-[#e293b8] hover:to-[#9c66b4] text-white font-extrabold text-sm tracking-wide text-center block shadow-lg shadow-[#d982ab]/25 transition"
          >
            25-Person Showcase (Finished Demo) →
          </Link>
          <Link
            href="/create-person"
            className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs tracking-wide text-center block transition border border-white/10"
          >
            Live Custom URL Flow (/create-person) →
          </Link>
          <Link href="/sign-in" className="primary-button w-full">
            Sign up with email
          </Link>
          <Link href={ONBOARDING_HREF} className="apple-sign-in-button">
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
            <span>Sign up with Apple</span>
          </Link>
          <Link
            href="/sign-in"
            className="block w-full pt-2 text-center text-sm font-bold text-white/72 hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </main>
    </PhoneShell>
  );
}
