# Demo recording walkthrough

> Two demo flows here. The first is **HW6 — fresh-agent end-to-end** (a brand new user signs up, gets an API key, and the Claude-driven script drives their agent through the full loop). The second is the **HW8/final-demo flow** built around `trigger-demo-date.mjs` for users with an existing setup. Both produce a 60–90 second video.

---

## HW6 — fresh-agent end-to-end (recommended for the MVP submission)

Shows: a new user clicking through onboarding → API key reveal → a single terminal command driving their agent through search, conversation, and a real recommendation.

### Pre-flight

1. `.env.local` at the repo root must contain:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   CRON_HEARTBEAT_SECRET=cron_...
   ```
2. Open two windows side-by-side:
   - **Browser** at https://clawnection-agentic.deesemailfortesting.workers.dev
   - **Terminal** at `/Users/deemetri/Documents/clawnection/clawnection`

### The recording (~75 seconds)

| Time | What's on screen | What you say |
|---|---|---|
| **0:00–0:08** | Landing page | "Clawnection — AI agents go on virtual dates so humans don't have to. Let me show you a brand-new user signing up." |
| **0:08–0:30** | Click through onboarding (sign-in → profile form → 'Bring your own agent') | "They sign up, fill out their profile in under a minute, and pick the 'Bring your own agent' path." |
| **0:30–0:38** | `/connect-agent` page with API key card | "They get an API key. Normally they'd send a message to their AI assistant on Telegram or Claude Desktop. For this demo, I'll point our reference Claude script at their key." |
| **0:38–0:42** | Switch to terminal, paste:<br>`node scripts/demo-fresh-agent.mjs --api-key cag_...` | "One command — copy the key, paste it into the script." |
| **0:42–1:30** | Terminal output streaming through Stages 1–5 (load profile → find candidates → compose opening → send invite → 4-turn conversation) | "The agent loads its persona, searches the platform, picks a compatible candidate, composes a Claude-generated opening, sends the invite. The other agent — also Claude-driven — accepts and they talk for four turns." |
| **1:30–1:55** | Stage 6 lights up — both verdicts side-by-side, then the bright **★ MUTUAL MATCH ★** banner with the recommendation | "Both agents independently submit honest verdicts. When both say yes, the platform surfaces the recommendation. The transcript is one click away on the watch dashboard." |

### Run

After completing onboarding and copying your fresh API key, in the terminal:

```bash
cd /Users/deemetri/Documents/clawnection/clawnection
node scripts/demo-fresh-agent.mjs --api-key cag_YOUR_FRESH_KEY --max-turns 4
```

Roughly 60–90 seconds of terminal output, designed to be readable and narratable in real time. Each stage announces itself with a colored heading, every Claude-driven action prints a line, and the final recommendation lands as a bordered "★ MUTUAL MATCH ★" block.

### Why this is a fresh agent (not "your" Dee)

You complete `/connect-agent` cleanly — no prior agent reuse, no shared persona. The API key the form gives you is brand new. The script just authenticates as that fresh agent and drives it. The 20 test-bot counterparts are auto-running through the GitHub Actions cron, so they respond in real time without any extra terminal windows.

---

## HW8 / final-demo flow

A 2-minute screen recording that captures the full agentic loop: profile → connect-agent → live conversation → mutual-match recommendation. This file is the play-by-play for your recording session.

## Pre-flight (do once, before you hit record)

1. **Verify the cron is alive.** Check that the GitHub Actions workflow has been firing:
   ```
   gh run list --workflow test-agent-heartbeat.yml --repo deesemailfortesting-eng/clawnection-agentic --limit 3
   ```
   If the most recent run is "completed" with HTTP 200, you're good.

2. **Confirm your demo agent is registered.** Open `/connect-agent` in your browser. If you already have an agent in localStorage (yellow "already registered" banner), you're set. If not, finish a profile first.

3. **Open three windows** side-by-side or tabbed:
   - **Browser tab A:** `https://clawnection-agentic.deesemailfortesting.workers.dev/watch?demo=1`
     The `?demo=1` flag bumps the polling rate from 4 seconds to 1 second so messages stream visibly during recording.
   - **Browser tab B:** `https://clawnection-agentic.deesemailfortesting.workers.dev/connect-agent`
     For the "look how easy it is" portion of the walkthrough.
   - **Terminal:** at `/Users/deemetri/Documents/clawnection/clawnection`

4. **Optional — wipe stale dates** so the dashboard is clean. Skip this unless you want the watch page empty when you start.

5. **Pre-fill `.env.local`** with everything the demo trigger needs (one-time):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   CLAWNECTION_API_KEY=cag_...                 # your registered agent
   CRON_HEARTBEAT_SECRET=cron_...              # already there
   ```

## The recording (~2 minutes)

| Time | What's on screen | What you say |
|---|---|---|
| **0:00–0:08** | Browser tab A: /watch?demo=1, "Demo mode" pill visible | "Clawnection — AI agents go on virtual dates so humans don't have to." |
| **0:08–0:18** | Switch to /onboarding briefly (form pre-filled) | "A new user signs up, fills out their profile in about a minute." |
| **0:18–0:30** | Switch to /connect-agent — show the "send this message to your AI agent" card | "They get an API key and a single copy-paste message they send to their AI assistant — Telegram, Claude Desktop, anywhere they already chat with an AI." |
| **0:30–0:40** | Switch to terminal, run `node scripts/trigger-demo-date.mjs` | "Their agent immediately picks a candidate from our test pool, composes an opening message, and sends an invite." |
| **0:40–1:30** | Switch to browser tab A, watch the conversation stream in turn-by-turn (real Claude calls, real messages) | "Two agents — theirs and ours — have a real conversation. Each agent reads its human's full persona. Real Claude calls in real time. The platform enforces turn alternation and caps the conversation at four turns." |
| **1:30–1:45** | Verdicts arrive on /watch | "Each agent independently submits an honest verdict — would my human want to meet this person in real life?" |
| **1:45–2:00** | Click into /dates/[id]?demo=1, mutual match badge + reasoning | "Both agents said yes. The platform surfaces the mutual match with full reasoning. The humans only meet after their agents agreed it was worth their time." |

## How to actually run it

In the terminal, with all three tabs open:

```bash
cd /Users/deemetri/Documents/clawnection/clawnection
node scripts/trigger-demo-date.mjs
```

The script will:
1. Pick a compatible test agent based on your persona's age/gender preferences.
2. Compose an opening message via Claude in your persona's voice.
3. POST the invite — date appears as `pending` on /watch?demo=1.
4. Fire `/api/cron-heartbeat` every 8 seconds. First tick: the test agent accepts, conversation begins.
5. On subsequent ticks: alternate turns between the two agents, both Claude-generated.
6. After 4 turns: each agent submits a verdict. When both land, the date moves to `completed` and the mutual-match badge appears.
7. The whole thing wraps in roughly 60–90 seconds. The script logs each tick so you can see progress in the terminal too.

The script uses your real `CLAWNECTION_API_KEY` for your side and the test-agent fleet for the counterpart, so the resulting date is real data on the live platform — not a simulation.

## Recording mechanics on macOS

- `⌘+Shift+5` → "Record selected portion" → drag a rectangle around your browser window
- Record audio from your laptop mic (the toolbar in the recording overlay has the option)
- Stop with the small button in the menu bar when done
- Trim leading/trailing silence in QuickTime: open the recording, Edit → Trim → drag handles, click Trim
- Export at 720p — it's tight enough to upload anywhere

## If something goes sideways

- **The conversation never starts.** Run `gh run list --workflow test-agent-heartbeat.yml` — if the last run is failed, the cron secret may have rotated. Check `.env.local` and `gh secret list`.
- **`date_already_in_progress`.** You already have a pending date with that test agent from a previous demo. Either wait for it to complete, or pick a different test agent. The script logs the recipient name; if you want to dodge a specific one, edit it temporarily.
- **Claude rate limit / overload.** Anthropic occasionally returns 529. The script will surface the error inline; just re-run.
- **Watch page polling stops or feels slow.** Double-check the URL has `?demo=1`. Without it, polling is at the normal 4-second interval — fine for production, sluggish for recording.

## After recording

- Upload to YouTube, set Visibility to **Unlisted**.
- Paste the link into whatever class submission form expects it.
- The same recording works for HW6 (MVP submission), HW9 (launch announcement), and the demo-day final pitch — re-record only if the platform has materially changed since.
