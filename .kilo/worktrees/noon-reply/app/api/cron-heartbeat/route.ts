import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ----- Types -----

type WorkerSelf = { fetch: (req: Request) => Promise<Response> };

type TickSummary = {
  agentId: string;
  personaName: string;
  invitesProcessed: number;
  messagesSent: number;
  verdictsSubmitted: number;
  errors: string[];
};

type Persona = {
  id: string;
  name: string;
  age: number;
  location?: string;
  bio?: string;
  interests?: string[];
  values?: string[];
  communicationStyle?: string;
  dealbreakers?: string[];
  idealFirstDate?: string;
  preferenceAgeRange?: { min: number; max: number };
  preferenceNotes?: string;
  relationshipIntent?: string;
  lookingFor?: string;
  lifestyleHabits?: Record<string, string>;
  // Soft-signal fields (migration 0007). Surface what makes the human
  // discerning beyond explicit dealbreakers — pet peeves, current life
  // context, soft anti-preferences, past patterns to break.
  petPeeves?: string[];
  currentLifeContext?: string;
  wantsToAvoid?: string[];
  pastPatternToBreak?: string;
};

type InboxResponse = {
  agent: { id: string; displayName: string };
  pendingInvites: Array<{
    date: { id: string };
    fromAgent: { id: string; displayName: string };
    fromPersona: Persona;
  }>;
  activeDates: Array<{
    date: { id: string; turnCount: number; maxTurns: number };
    counterpartAgent: { id: string };
    counterpartPersona: Persona;
    counterpartTurnsAhead: number;
  }>;
  awaitingMyVerdict: Array<{
    date: { id: string };
    counterpartAgent: { id: string };
    counterpartPersona: Persona;
  }>;
};

// ----- Config -----

const MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_AGENTS_PER_TICK = 3;
const MAX_AGENTS_PER_TICK = 10;

// ----- E1 (persona-richness ablation) -----
//
// Subject agents tagged with framework `exp-e1-rich`, `exp-e1-medium`, or
// `exp-e1-thin` get a deliberately-varied amount of THEIR OWN persona context
// in the prompt that drives their decisions. The platform persona stored in
// D1 is the same in all cases (we share local-dee across all three subjects);
// what differs is how much we hand to Claude when composing turns and
// verdicts. This isolates "agent's access to its own persona" as the
// independent variable.
type PersonaRichness = "rich" | "medium" | "thin";

function richnessForFramework(fw: string | null | undefined): PersonaRichness {
  if (!fw) return "rich";
  if (fw === "exp-e1-medium") return "medium";
  if (fw === "exp-e1-thin") return "thin";
  return "rich";
}

function personaContextFor(persona: Persona, richness: PersonaRichness): string {
  if (richness === "rich") return JSON.stringify(persona, null, 2);
  if (richness === "medium") {
    // Medium intentionally STRIPS soft signals — the experiment depends on
    // them being rich-only. Otherwise the test for "does richer self-
    // knowledge change the verdict" would be confounded.
    return JSON.stringify(
      {
        name: persona.name,
        age: persona.age,
        location: persona.location,
        bio: persona.bio,
        topInterests: (persona.interests ?? []).slice(0, 3),
      },
      null,
      2,
    );
  }
  // thin
  return JSON.stringify(
    {
      name: persona.name,
      age: persona.age,
      bio: persona.bio,
    },
    null,
    2,
  );
}

// ----- Invite-time persona view -----
//
// Returns the subset of a persona that the invite-step decision sees.
// Hard filters only: name, age, bio, interests, dealbreakers, intent,
// preferenceAgeRange, lookingFor. Soft signals (lifestyleHabits,
// petPeeves, currentLifeContext, wantsToAvoid, pastPatternToBreak,
// preferenceNotes) are deliberately stripped — those belong to the
// verdict step.
//
// Without this separation, soft signals function as effective
// dealbreakers because the recipient can see them in the inbound
// invite. That collapses the 3-outcome space back to 2 (decline-at-
// invite or mutual-yes), which is exactly the rubber-stamp problem
// HW7+HW8 surfaced.
function bareInvitePersonaFor(persona: Persona): string {
  return JSON.stringify(
    {
      name: persona.name,
      age: persona.age,
      location: persona.location,
      bio: persona.bio,
      interests: persona.interests,
      values: persona.values,
      relationshipIntent: persona.relationshipIntent,
      preferenceAgeRange: persona.preferenceAgeRange,
      lookingFor: persona.lookingFor,
      dealbreakers: persona.dealbreakers,
    },
    null,
    2,
  );
}

// ----- E2 (Haiku vs Sonnet) -----
//
// Subject agents tagged with framework `exp-e2-sonnet` use Claude Sonnet
// instead of the default Haiku. Lets us measure cost/latency/quality trade
// on identical persona pairs.
const SONNET_MODEL = "claude-sonnet-4-6";

function modelForFramework(fw: string | null | undefined): string {
  if (fw === "exp-e2-sonnet") return SONNET_MODEL;
  return MODEL;
}

// ----- E3 (Honesty-emphasized prompt) -----
//
// Subject agents tagged with framework `exp-e3-honesty` get an extra
// preamble on their verdict prompt that emphasizes the cost of polite
// false-yes verdicts. The hypothesis is this catches dealbreaker conflicts
// the standard prompt rubber-stamps over.
const HONESTY_PREAMBLE =
  "CRITICAL HONESTY NOTE: Your human relies on you to filter out bad matches before wasting their real time. A polite false-yes from you costs them an actual evening and emotional energy with someone incompatible. If their persona has any dealbreaker, lifestyle conflict, intent mismatch, or value misalignment with this person — even if the conversation was friendly — you MUST return wouldMeetIrl=false and name the conflict specifically. Friendly conversation is not evidence of compatibility.\n\n";

function verdictHonestyPreambleForFramework(
  fw: string | null | undefined,
): string {
  if (fw === "exp-e3-honesty") return HONESTY_PREAMBLE;
  return "";
}

// ----- Auth helpers -----

function expectedSecret(env: unknown): string | null {
  return (env as { CRON_HEARTBEAT_SECRET?: string }).CRON_HEARTBEAT_SECRET ?? null;
}

function checkSecret(req: NextRequest, secret: string | null): boolean {
  if (!secret) return false;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided && provided === secret) return true;
  const header = req.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

// ----- Self-fetch wrapping the platform's public API -----

function buildApi(selfRef: WorkerSelf, baseOrigin: string, apiKey: string) {
  return async function callApi(
    method: string,
    path: string,
    body?: unknown,
  ) {
    const req = new Request(`${baseOrigin}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const res = await selfRef.fetch(req);
    let json: unknown = null;
    try { json = await res.json(); } catch {}
    if (!res.ok) {
      const e =
        ((json as { error?: string; message?: string } | null)?.error ??
          (json as { error?: string; message?: string } | null)?.message) ||
        `HTTP ${res.status}`;
      throw new Error(`${method} ${path} → ${e}`);
    }
    return json as unknown;
  };
}

// ----- Anthropic helper -----

async function claude(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 350,
  model: string = MODEL,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = json.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new Error("anthropic: empty text response");
  return text;
}

function tryParseJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

// ----- Per-agent heartbeat -----

async function runOneAgentTick(args: {
  apiKey: string;
  selfRef: WorkerSelf;
  baseOrigin: string;
  anthropicKey: string;
}): Promise<TickSummary> {
  const { apiKey, selfRef, baseOrigin, anthropicKey } = args;
  const api = buildApi(selfRef, baseOrigin, apiKey);

  // Resolve self
  const me = (await api("GET", "/api/agent/me")) as {
    agent: { id: string; displayName: string; framework: string | null };
    persona: Persona;
  };
  const richness = richnessForFramework(me.agent.framework);
  const ownPersonaContext = personaContextFor(me.persona, richness);
  const subjectModel = modelForFramework(me.agent.framework);
  const verdictHonestyPreamble = verdictHonestyPreambleForFramework(
    me.agent.framework,
  );
  const summary: TickSummary = {
    agentId: me.agent.id,
    personaName: me.persona.name,
    invitesProcessed: 0,
    messagesSent: 0,
    verdictsSubmitted: 0,
    errors: [],
  };

  // Sweep inbox
  const inbox = (await api("GET", "/api/agent/inbox")) as InboxResponse;

  // 1) Pending invites — accept/decline via Claude.
  //
  // Important: invite-time decisions intentionally see ONLY hard signals
  // (dealbreakers, intent, age, bio, interests). Soft signals — pet
  // peeves, current life context, lifestyle habits, wants_to_avoid,
  // past_pattern_to_break — are stripped here so they only fire at
  // verdict time. This preserves the 3-outcome space (decline-at-invite,
  // completed-no, mutual-yes) instead of letting soft signals function
  // as effective dealbreakers and collapse it back to 2.
  for (const inv of inbox.pendingInvites) {
    try {
      const myInviteView = bareInvitePersonaFor(me.persona);
      const theirInviteView = bareInvitePersonaFor(inv.fromPersona);
      const sys = `You are an AI agent representing ${me.persona.name} on a virtual dating platform. Decide whether to accept or decline a date invite from ${inv.fromPersona.name}.

This is a fast first-screen check, not a final verdict. Bias HARD toward accepting — the conversation step exists to surface deeper compatibility issues. Only decline if there's an obvious hard-signal mismatch:
- Their persona violates one of YOUR explicit dealbreakers (smoking, dishonesty, etc.)
- Their relationshipIntent is incompatible with yours (e.g., they want casual, you want long-term)
- Their age is clearly outside your preferred range

If none of those three triggers fire, ACCEPT and let the date play out. Subtler concerns — energy mismatch, life-stage gap, future-vision differences, lifestyle clashes — should NOT decline at this stage; they're the verdict step's job to evaluate after the conversation.

Return ONLY JSON, no markdown fences: {"action": "accept" | "decline", "reason": "<1 sentence>"}

YOUR PERSONA (hard-signal view):
${myInviteView}

THEIR PERSONA (hard-signal view):
${theirInviteView}`;
      const reply = await claude(
        anthropicKey,
        sys,
        "Respond with the JSON.",
        200,
        subjectModel,
      );
      const parsed = tryParseJson(reply) as
        | { action?: string; reason?: string }
        | null;
      const action =
        parsed?.action === "decline" ? "decline" : "accept"; // bias to accept on parse fail
      await api("POST", `/api/dates/${inv.date.id}/respond`, { action });
      summary.invitesProcessed += 1;
    } catch (err) {
      summary.errors.push(
        `invite ${inv.date.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2) Active dates where it's my turn — compose next message via Claude.
  for (const d of inbox.activeDates) {
    if (d.counterpartTurnsAhead === 0) continue;
    try {
      const msgs = (await api(
        "GET",
        `/api/dates/${d.date.id}/messages`,
      )) as {
        messages: Array<{ senderAgentId: string; turnNumber: number; content: string }>;
      };
      const transcript = msgs.messages
        .map((m) => {
          const who =
            m.senderAgentId === me.agent.id
              ? me.persona.name
              : d.counterpartPersona.name;
          return `${who} (turn ${m.turnNumber}): ${m.content}`;
        })
        .join("\n\n");

      const sys = `You are an AI agent on a virtual dating platform representing ${me.persona.name}. Compose the next message in an ongoing date with ${d.counterpartPersona.name}.

- Stay in ${me.persona.name}'s voice (${me.persona.communicationStyle ?? "warm"} style).
- Reference specific details from your bio, interests, values, or ideal first date.
- Engage with what ${d.counterpartPersona.name} just said.
- 1–3 sentences. Conversation is short (turn ${d.date.turnCount + 1} of ${d.date.maxTurns}).
- Move toward whether you'd actually want to meet IRL.
- Output the raw message text only — no quotes, no "Name:" prefix.

YOUR PERSONA:
${ownPersonaContext}

THEIR PERSONA:
${JSON.stringify(d.counterpartPersona, null, 2)}`;
      const next = await claude(
        anthropicKey,
        sys,
        `Conversation so far:\n\n${transcript || "(no messages yet)"}\n\nWrite ${me.persona.name}'s next message.`,
        250,
        subjectModel,
      );
      await api("POST", `/api/dates/${d.date.id}/messages`, { content: next });
      summary.messagesSent += 1;
    } catch (err) {
      summary.errors.push(
        `message ${d.date.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3) Awaiting my verdict — submit honest verdict via Claude.
  for (const w of inbox.awaitingMyVerdict) {
    try {
      const msgs = (await api(
        "GET",
        `/api/dates/${w.date.id}/messages`,
      )) as {
        messages: Array<{ senderAgentId: string; turnNumber: number; content: string }>;
      };
      const transcript = msgs.messages
        .map((m) => {
          const who =
            m.senderAgentId === me.agent.id
              ? me.persona.name
              : w.counterpartPersona.name;
          return `${who} (turn ${m.turnNumber}): ${m.content}`;
        })
        .join("\n\n");

      // Discriminating verdict prompt — replaces the rubber-stamp version
      // identified in HW7+HW8 analysis. Multi-dimensional scoring forces
      // the agent to evaluate independent compatibility axes rather than
      // give one narrative thumbs-up. Default to NO unless every dimension
      // clears the bar; the conversational warmth that biased the old
      // single-question format toward yes is now just one of seven inputs.
      const sys = `${verdictHonestyPreamble}You are an AI agent representing ${me.persona.name}. You just finished a virtual date with ${w.counterpartPersona.name}. Your job is to give your human a discriminating recommendation — not to rubber-stamp a friendly conversation.

Real first dates have a wide outcome distribution: only some end with both people wanting a second date, and many end with one or both saying "they were nice, but not for me." Your default should be skepticism. A friendly conversation is necessary but NOT sufficient — the conversation must demonstrate compatibility across multiple dimensions, not just feel pleasant.

Step 1 — Score these 7 dimensions independently, each 1-10:
  - chemistry: did the conversational energy feel mutual and alive?
  - communication_style_fit: do their styles complement each other or grate?
  - life_stage_alignment: are they at compatible points in life (career, family, healing, settling)?
  - values_alignment: did the conversation surface shared or compatible core values?
  - intent_alignment: do their relationship goals genuinely line up?
  - lifestyle_compatibility: schedules, energy, social patterns — would daily life mesh?
  - logistics_and_followthrough: did they show evidence of being able to actually plan and show up?

Step 2 — Counterfactual probe. Imagine this date actually happened in person and the human did not want a second date. What is the single most likely reason, based on what they said or implied in the conversation? Be specific.

Step 3 — Compute wouldMeetIrl. Default = false. Only return true if ALL 7 dimensions are 7+ AND your counterfactual concern is weak/speculative. If any dimension is below 7, or the counterfactual concern is concrete, return false. A 5/10 chemistry plus a 9/10 logistics is NOT a yes — it's a polite no.

Pay special attention to soft-signal fields if present in YOUR PERSONA: petPeeves, currentLifeContext, wantsToAvoid, pastPatternToBreak. These are the human telling you "even if everything else looks fine, watch for these." If the conversation hints at any of them, downgrade the relevant dimension and surface it in counterfactualConcern.

Return ONLY JSON, no markdown fences: {
  "dimensionScores": {"chemistry": <1-10>, "communication_style_fit": <1-10>, "life_stage_alignment": <1-10>, "values_alignment": <1-10>, "intent_alignment": <1-10>, "lifestyle_compatibility": <1-10>, "logistics_and_followthrough": <1-10>},
  "counterfactualConcern": "<one sentence: most likely reason this date wouldn't lead to a second one>",
  "wouldMeetIrl": <true|false>,
  "rating": <1-10, the lowest of the 7 dimensions>,
  "reasoning": "<1-2 sentences explaining the verdict, citing specific dimensions>"
}

YOUR PERSONA:
${ownPersonaContext}

THEIR PERSONA:
${JSON.stringify(w.counterpartPersona, null, 2)}`;
      const reply = await claude(
        anthropicKey,
        sys,
        `Conversation:\n\n${transcript}\n\nReturn the verdict JSON.`,
        500,
        subjectModel,
      );
      const parsed = tryParseJson(reply) as
        | {
            wouldMeetIrl?: boolean;
            rating?: number;
            reasoning?: string;
            dimensionScores?: Record<string, number>;
            counterfactualConcern?: string;
          }
        | null;
      // Compose the reasoning to surface the new structured data inline
      // — date_messages.verdict only stores reasoning text, so the
      // counterfactual + dimension scores need to be embedded there to
      // be queryable later.
      const dimsLine = parsed?.dimensionScores
        ? Object.entries(parsed.dimensionScores)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")
        : "";
      const concernLine = parsed?.counterfactualConcern
        ? ` | counterfactual: ${parsed.counterfactualConcern}`
        : "";
      const composedReasoning =
        (parsed?.reasoning ?? "Verdict parse failed; defaulted to no.") +
        (dimsLine ? ` | dims: ${dimsLine}` : "") +
        concernLine;
      const verdict = {
        wouldMeetIrl: typeof parsed?.wouldMeetIrl === "boolean" ? parsed.wouldMeetIrl : false,
        rating: typeof parsed?.rating === "number" ? parsed.rating : 5,
        reasoning: composedReasoning,
      };
      await api("POST", `/api/dates/${w.date.id}/verdict`, verdict);
      summary.verdictsSubmitted += 1;
    } catch (err) {
      summary.errors.push(
        `verdict ${w.date.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return summary;
}

// ----- Route -----

export async function POST(req: NextRequest): Promise<Response> {
  return run(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return run(req);
}

async function run(req: NextRequest): Promise<Response> {
  const { env } = getCloudflareContext();
  const cfEnv = env as unknown as {
    DB: D1Database;
    WORKER_SELF_REFERENCE?: WorkerSelf;
    ANTHROPIC_API_KEY?: string;
    CRON_HEARTBEAT_SECRET?: string;
  };

  if (!checkSecret(req, expectedSecret(env))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const selfRef = cfEnv.WORKER_SELF_REFERENCE;
  if (!selfRef) {
    return NextResponse.json(
      { error: "worker_self_reference_missing" },
      { status: 500 },
    );
  }
  const anthropicKey = cfEnv.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: "anthropic_api_key_not_set" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const baseOrigin = `${url.protocol}//${url.host}`;
  const limitRaw = parseInt(
    url.searchParams.get("limit") ?? `${DEFAULT_AGENTS_PER_TICK}`,
    10,
  );
  const limit = Math.min(Math.max(limitRaw || DEFAULT_AGENTS_PER_TICK, 1), MAX_AGENTS_PER_TICK);

  // Pick test agents that are due. Order: never-ticked first, then oldest tick.
  const { results } = await cfEnv.DB
    .prepare(
      `SELECT agent_id, api_key
       FROM test_agent_credentials
       WHERE is_active = 1
       ORDER BY (CASE WHEN last_tick_at IS NULL THEN 0 ELSE 1 END), last_tick_at ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ agent_id: string; api_key: string }>();
  const candidates = results ?? [];

  const summaries: TickSummary[] = [];
  for (const c of candidates) {
    try {
      const s = await runOneAgentTick({
        apiKey: c.api_key,
        selfRef,
        baseOrigin,
        anthropicKey,
      });
      summaries.push(s);
    } catch (err) {
      summaries.push({
        agentId: c.agent_id,
        personaName: "?",
        invitesProcessed: 0,
        messagesSent: 0,
        verdictsSubmitted: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
    // Mark ticked even if errored — avoids hot-spinning on a broken agent.
    await cfEnv.DB
      .prepare(
        "UPDATE test_agent_credentials SET last_tick_at = datetime('now') WHERE agent_id = ?",
      )
      .bind(c.agent_id)
      .run();
  }

  const totals = {
    agentsProcessed: summaries.length,
    invitesProcessed: summaries.reduce((a, s) => a + s.invitesProcessed, 0),
    messagesSent: summaries.reduce((a, s) => a + s.messagesSent, 0),
    verdictsSubmitted: summaries.reduce((a, s) => a + s.verdictsSubmitted, 0),
    totalErrors: summaries.reduce((a, s) => a + s.errors.length, 0),
  };

  return NextResponse.json({ ranAt: new Date().toISOString(), totals, summaries });
}
