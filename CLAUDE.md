@AGENTS.md

# WTF Radar (Clawnection) — Claude session context

## What this project is
Agentic matchmaking app (rebranded from Clawnection to WTF Radar). Users build a romantic profile (via voice conversation or manual form), optionally upload chat exports (WhatsApp + FB Messenger) for behavioral signal extraction, then get scored and matched against other users via server-side scoring. Built on Next.js + Cloudflare Workers + D1.

## Live deployment
- **URL:** https://clawnection.deesemailfortesting.workers.dev
- **Cloudflare account:** deesemailfortesting@gmail.com
- **Worker name:** `clawnection`
- **D1 database:** `clawnection-db` (ID: `5bddf833-3d10-43d2-a18c-e443d04e79af`)
- **API token (D1 + Workers scope):** stored in Cloudflare dashboard — do not commit. Set as `CLOUDFLARE_API_TOKEN` env var before running wrangler commands.

## How to redeploy
```bash
# From /tmp/clawnection
CLOUDFLARE_API_TOKEN=<token> \
  node node_modules/@opennextjs/cloudflare/dist/cli/index.js build

CLOUDFLARE_API_TOKEN=<token> \
  OPEN_NEXT_DEPLOY=true \
  ~/.local/bin/wrangler deploy --config wrangler.jsonc
```

`OPEN_NEXT_DEPLOY=true` is required — without it wrangler tries to delegate to `opennextjs-cloudflare deploy`, which crashes on macOS 12.5 (Workers runtime requires macOS 13.5+).

## Authentication
PR #36 added email/password + Sign in with Apple auth. JWT sessions stored in `wtfradar_session` cookie. The middleware gates all app routes behind `/sign-in` when `AUTH_SESSION_SECRET` is set.

To enable auth:
```bash
CLOUDFLARE_API_TOKEN=<token> \
  ~/.local/bin/wrangler secret put AUTH_SESSION_SECRET
# Enter any random 32+ character string
```

Auth files live in `lib/auth/` (AuthProvider, session, password, apple).

## npm/npx are broken on this machine
The symlinks at `~/.local/bin/npm` and `~/.local/bin/npx` were pointing to a relative path that doesn't exist. They've been patched to use absolute paths. If npm stops working again:
```bash
cat > /Users/mayalevy/.local/bin/npm << 'EOF'
#!/usr/bin/env node
require('/Users/mayalevy/.local/lib/node_modules/npm/lib/cli.js')(process)
EOF
chmod +x /Users/mayalevy/.local/bin/npm

cat > /Users/mayalevy/.local/bin/npx << 'EOF'
#!/usr/bin/env node
require('/Users/mayalevy/.local/lib/node_modules/npm/bin/npx-cli.js')
EOF
chmod +x /Users/mayalevy/.local/bin/npx
```

Use `node ~/.local/lib/node_modules/npm/bin/npm-cli.js` as a fallback if the shim breaks again.

## Environment variables
Stored in `/tmp/clawnection/.env.local` (baked into the build, not deployed as secrets):
```
NEXT_PUBLIC_VAPI_API_KEY=9058d621-d733-4b05-b4b0-c6e2a8ed549b
NEXT_PUBLIC_VAPI_ASSISTANT_ID=d1f8ed5a-69dd-45b4-8d1b-641df6d15051
```
These are `NEXT_PUBLIC_` so they get embedded at build time. If they change, rebuild and redeploy.

Cloudflare secrets (set via `wrangler secret put`):
- `AUTH_SESSION_SECRET` — JWT signing key for auth sessions

Cloudflare vars (in `wrangler.jsonc`):
- `SCORING_WEIGHTS` — JSON string of scoring weight overrides (see Scoring section)

## Git remote
The GitHub repo is `sundai-hack-clawnection/clawnection`. The remote is named `sundai` (not `origin`).
```bash
git push sundai main
```
Teammates are actively pushing to this repo. Always `git fetch sundai && git merge sundai/main --no-edit` before pushing.

## User flow
```
/sign-in → / (landing)
  ├→ /voice-onboarding → /review-profile?from=voice
  └→ /review-profile (manual)
       └→ /upload-data (WhatsApp + FB Messenger, optional)
            └→ /demo (pick counterpart, server-side scoring)
                 └→ /results (match results + recommendation)
```

## Architecture

```
Browser (Next.js, dark "Obsidian" theme)
  ↓ fetch
app/api/**          ← Next.js edge route handlers
  ↓ D1 binding
Cloudflare D1       ← clawnection-db (SQLite)
```

All pages use the `PhoneShell` + `AppHeader` components with CSS custom properties for the dark theme (defined in `globals.css`). Key CSS vars: `--surface-base`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-subtle`, `--accent`. Key classes: `input-obsidian`, `btn-primary`, `btn-secondary`, `card-obsidian`.

localStorage is used as a fast local cache. Server sync for profiles is awaited with error reporting. Chat data upload goes directly to server (never stored in localStorage).

## Database tables
- `profiles` — romantic profiles (from text or voice onboarding)
- `signal_bundles` — behavioral signals per profile (WhatsApp + FB Messenger). Has `source` column tracking origin.
- `self_awareness_gaps` — internal only, delta between stated vs behavioral profile
- `match_results` — scoring results with score + verdict
- `users` — auth accounts (email, apple_sub, password_hash)
- `negotiation_sessions` / `negotiation_messages` — Layer 3 foundation, empty for now

Migration files:
- `migrations/0001_initial.sql` — core tables (applied)
- `migrations/0002_auth.sql` — users table (applied)
- `migrations/0003_signal_source.sql` — source column on signal_bundles (applied)

To query the live DB:
```bash
CLOUDFLARE_API_TOKEN=<token> \
  ~/.local/bin/wrangler d1 execute clawnection-db --remote \
  --command="SELECT id, name, age, location FROM profiles ORDER BY created_at DESC LIMIT 10"
```

## Scoring
Scoring runs **server-side** at `POST /api/scoring`. The algorithm is rule-based with configurable weights.

Weights are read from the `SCORING_WEIGHTS` env var in `wrangler.jsonc`. To tune scoring, edit the JSON in `wrangler.jsonc` `vars.SCORING_WEIGHTS` and redeploy. Defaults are in `lib/matching/scoring.ts` (`DEFAULT_WEIGHTS`).

Key weight fields: `baseScore` (50), `sharedInterestPoints` (6), `sharedValuePoints` (8), `intentMatchBonus` (12), `commStyleMatchBonus` (8), `locationBonus` (6), `ageFitBonus` (6), `smokingDealbreaker` (18), `generalDealbreaker` (12).

The scoring endpoint fetches profiles from D1, fetches behavioral signals if available, runs scoring, stores the result in `match_results`, and returns the full `MatchResult`.

## Chat data privacy
Raw chat exports (WhatsApp/FB Messenger) are parsed and scored **server-side** at `POST /api/upload`. Only the extracted behavioral signals (response latency, emoji density, initiation ratio, etc.) are stored in D1. **Raw chat text is never persisted.** It is processed in-memory and discarded after signal extraction.

## Key files

| Path | What it does |
|---|---|
| **Pages** | |
| `app/page.tsx` | Landing page with CTAs to profile creation and voice onboarding |
| `app/sign-in/page.tsx` | Auth page (email/password + Apple sign-in) |
| `app/voice-onboarding/page.tsx` | Voice onboarding via Vapi AI → redirects to /review-profile?from=voice |
| `app/review-profile/page.tsx` | Unified profile form — review voice data OR create from scratch |
| `app/onboarding/page.tsx` | Legacy redirect → /review-profile |
| `app/upload-data/page.tsx` | Chat data upload (WhatsApp + FB Messenger) with consent gate + signal preview |
| `app/demo/page.tsx` | Pick counterpart from real D1 profiles (or samples), run server-side scoring |
| `app/results/page.tsx` | Match results with score, strengths, concerns, round summaries |
| **API routes** | |
| `app/api/profiles/route.ts` | POST upsert / GET single or list profiles from D1 |
| `app/api/upload/route.ts` | POST chat files → parse → extract signals → store signals → discard raw data |
| `app/api/scoring/route.ts` | POST server-side scoring with configurable weights |
| `app/api/signals/route.ts` | POST / GET signal bundles |
| `app/api/gaps/route.ts` | POST / GET self-awareness gap (internal) |
| `app/api/matches/route.ts` | POST / GET match results |
| `app/api/matches/[id]/route.ts` | GET single match result |
| `app/api/auth/*.ts` | Register, login, logout, Apple sign-in, session check |
| **Core logic** | |
| `lib/matching/scoring.ts` | Configurable scoring algorithm (ScoringWeights, scoreProfiles, buildRecommendation) |
| `lib/matching/virtualDate.ts` | Client-side virtual date simulation (uses scoring.ts, kept for backward compat) |
| `lib/whatsapp/parser.ts` | WhatsApp export parser (iOS + Android formats) |
| `lib/messenger/parser.ts` | FB Messenger JSON export parser |
| `lib/whatsapp/signals.ts` | Signal extraction + weighted multi-file merge (source-agnostic) |
| `lib/whatsapp/enrichProfile.ts` | Updates profile fields from behavioral signals |
| `lib/auth/` | AuthProvider, session (JWT), password (PBKDF2), Apple token verification |
| `lib/storage.ts` | localStorage helpers + server sync functions |
| **Config** | |
| `lib/types/matching.ts` | RomanticProfile, MatchResult, ScoringWeights types |
| `lib/types/behavioral.ts` | WhatsAppSignals, SelfAwarenessGap types |
| `wrangler.jsonc` | Cloudflare Workers config with D1 binding + SCORING_WEIGHTS var |
| `env.d.ts` | TypeScript types for Cloudflare env bindings |
| `middleware.ts` | Auth middleware — gates app routes behind /sign-in |
| `components/PhoneShell.tsx` | Dark phone-frame layout wrapper |
| `components/AppHeader.tsx` | Header with logo + auth status |

## Voice onboarding — how it works
1. User fills pre-call form (name, gender, sexual preference)
2. Vapi SDK starts a call with assistant `d1f8ed5a-69dd-45b4-8d1b-641df6d15051`
3. During the call the assistant emits a message containing `PROFILE_DATA: {...}` JSON
4. On call-end, the page parses that JSON → builds a `RomanticProfile` → saves to localStorage
5. Redirects to `/review-profile?from=voice` where the user reviews and confirms before D1 sync

## Chat upload — how it works
On `/upload-data`, users can upload one or more WhatsApp (.txt/.zip) and/or FB Messenger (.json) exports. Files are POSTed to `/api/upload` which:
1. Parses each file with the appropriate parser (WhatsApp or FB Messenger)
2. Extracts behavioral signals (response latency, emoji density, initiation ratio, communication style, etc.)
3. Merges signals across all files weighted by message count
4. Stores only the merged signal JSON in D1 `signal_bundles` table
5. Returns signals to the frontend for preview display
6. **Discards raw chat text** — never persisted

## What's not done yet
- Layer 3: agent-to-agent negotiation protocol (tables exist, logic not built)
- Real LLM calls in the agent adapter (currently deterministic/rule-based)
- Matching between two real users automatically (currently user picks counterpart manually)
- Issue #27: canonical normalization layer for chat ingestion (assigned to Dipsomancer)
