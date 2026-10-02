/**
 * Build-time feature flags. Read from NEXT_PUBLIC_* env vars so the same
 * value is available in both server and client components.
 *
 * Defaults are intentionally conservative — features default OFF unless
 * the env var is explicitly set to "true". This means production builds
 * without the var set behave like production (feature disabled) rather
 * than developer (feature enabled).
 */

export const VOICE_ONBOARDING_ENABLED =
  process.env.NEXT_PUBLIC_VOICE_ONBOARDING_ENABLED === "true";

/**
 * Where the "Build your profile" / "Start onboarding" buttons should
 * route. When voice onboarding is enabled, this points at the voice flow
 * (since voice is the more polished entry path). When disabled, it falls
 * back to the text-form onboarding.
 */
export const ONBOARDING_HREF: "/voice-onboarding" | "/onboarding" =
  VOICE_ONBOARDING_ENABLED ? "/voice-onboarding" : "/onboarding";
