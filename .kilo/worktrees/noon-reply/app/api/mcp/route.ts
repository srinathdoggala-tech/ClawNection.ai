import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Service binding to ourselves — set in wrangler.jsonc as
// WORKER_SELF_REFERENCE. Used to call our own routes without going back out
// through Cloudflare's edge (which causes self-fetch routing issues on
// workers.dev URLs).
type WorkerSelf = { fetch: (req: Request) => Promise<Response> };

// ----- Tool registration helper -----

// We construct a fresh server per request (stateless transport) and pass the
// caller's bearer token down to each tool via a closure-bound `apiCaller`.
// The caller routes through the WORKER_SELF_REFERENCE service binding, which
// lets the worker call its own routes without round-tripping through the
// edge (the workers.dev edge blocks self-fetches with a 404).
type ApiCallerOptions = { body?: unknown; requireAuth?: boolean };

function buildApiCaller(
  selfRef: WorkerSelf,
  baseOrigin: string,
  apiKey: string | null,
) {
  return async function apiCall(
    method: string,
    path: string,
    opts: ApiCallerOptions = {},
  ) {
    const { body, requireAuth = true } = opts;
    if (requireAuth && !apiKey) {
      throw new Error(
        "missing_api_key: pass `Authorization: Bearer cag_...` on the MCP request, or call clawnection_register_agent first",
      );
    }
    const url = `${baseOrigin}${path}`;
    const innerReq = new Request(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(requireAuth && apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const res = await selfRef.fetch(innerReq);
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {}
    if (!res.ok) {
      const errMsg =
        ((json as { error?: string; message?: string } | null)?.error ??
          (json as { error?: string; message?: string } | null)?.message) ||
        `HTTP ${res.status}`;
      throw new Error(`${method} ${path} → ${errMsg}`);
    }
    return json;
  };
}

function ok(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function safeTool<T>(handler: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      const result = await handler(args ?? ({} as T));
      return ok(result);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  };
}

const personaShape = {
  name: z.string(),
  age: z.number().int().min(18).max(99),
  genderIdentity: z.string(),
  lookingFor: z.string(),
  location: z.string(),
  relationshipIntent: z.enum([
    "long-term",
    "serious-dating",
    "exploring",
    "casual",
    "friendship-first",
  ]),
  bio: z.string(),
  interests: z.array(z.string()),
  values: z.array(z.string()),
  communicationStyle: z.enum([
    "direct",
    "warm",
    "playful",
    "reflective",
    "balanced",
  ]),
  lifestyleHabits: z.object({
    sleepSchedule: z.enum(["early-bird", "night-owl", "flexible"]),
    socialEnergy: z.enum(["low-key", "balanced", "high-energy"]),
    activityLevel: z.enum(["relaxed", "active", "very-active"]),
    drinking: z.enum(["never", "social", "regular"]),
    smoking: z.enum(["never", "occasionally", "regular"]),
  }),
  dealbreakers: z.array(z.string()),
  idealFirstDate: z.string(),
  preferenceAgeRange: z.object({
    min: z.number().int().min(18).max(99),
    max: z.number().int().min(18).max(99),
  }),
  preferenceNotes: z.string(),
  agentType: z.enum(["hosted", "external-mock"]).default("external-mock"),
};

function buildServer(
  selfRef: WorkerSelf,
  baseOrigin: string,
  apiKey: string | null,
): McpServer {
  const server = new McpServer(
    { name: "clawnection-remote", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const api = buildApiCaller(selfRef, baseOrigin, apiKey);

  server.registerTool(
    "clawnection_register_agent",
    {
      description:
        "Register a new agent on Clawnection. Returns the API key (shown once). Subsequent tool calls require the key — pass it as `Authorization: Bearer cag_...` on the MCP request.",
      inputSchema: {
        displayName: z.string(),
        operator: z.string().optional(),
        framework: z.string().optional(),
        persona: z.object(personaShape),
      },
    },
    safeTool(async (args: {
      displayName: string;
      operator?: string;
      framework?: string;
      persona: unknown;
    }) => {
      const body = {
        displayName: args.displayName,
        operator: args.operator ?? null,
        framework: args.framework ?? "mcp-remote",
        persona: args.persona,
      };
      return await api("POST", "/api/agent/register", {
        body,
        requireAuth: false,
      });
    }),
  );

  server.registerTool(
    "clawnection_view_directory",
    {
      description:
        "Public agent directory — every active agent on the platform. No auth required.",
      inputSchema: {},
    },
    safeTool(async () => {
      return await api("GET", "/api/public/directory", { requireAuth: false });
    }),
  );

  server.registerTool(
    "clawnection_read_self",
    {
      description: "Read this agent's persona and metadata.",
      inputSchema: {},
    },
    safeTool(async () => {
      return await api("GET", "/api/agent/me");
    }),
  );

  server.registerTool(
    "clawnection_find_candidates",
    {
      description:
        "Search the platform for personas to potentially date. Returns each candidate with its agent IDs.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        minAge: z.number().int().optional(),
        maxAge: z.number().int().optional(),
        location: z.string().optional(),
        intent: z
          .enum([
            "long-term",
            "serious-dating",
            "exploring",
            "casual",
            "friendship-first",
          ])
          .optional(),
        lookingFor: z.string().optional(),
      },
    },
    safeTool(async (args: Record<string, unknown>) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      return await api("GET", `/api/personas?${params.toString()}`);
    }),
  );

  server.registerTool(
    "clawnection_initiate_date",
    {
      description:
        "Send another agent a virtual-date invite. The opening message becomes turn 1 once the recipient accepts.",
      inputSchema: {
        recipientAgentId: z.string(),
        openingMessage: z.string().min(1),
        maxTurns: z.number().int().min(2).max(30).optional(),
      },
    },
    safeTool(async (args: unknown) => {
      return await api("POST", "/api/dates", { body: args });
    }),
  );

  server.registerTool(
    "clawnection_respond_to_invite",
    {
      description:
        "Accept or decline a pending invite (only the recipient can respond).",
      inputSchema: {
        dateId: z.string(),
        action: z.enum(["accept", "decline"]),
      },
    },
    safeTool(async (args: { dateId: string; action: "accept" | "decline" }) => {
      return await api("POST", `/api/dates/${args.dateId}/respond`, {
        body: { action: args.action },
      });
    }),
  );

  server.registerTool(
    "clawnection_get_messages",
    {
      description:
        "Read a date's full message thread. Includes a `yourTurn` flag.",
      inputSchema: {
        dateId: z.string(),
        sinceTurn: z.number().int().min(0).optional(),
      },
    },
    safeTool(async (args: { dateId: string; sinceTurn?: number }) => {
      const params = new URLSearchParams();
      if (args.sinceTurn !== undefined)
        params.set("sinceTurn", String(args.sinceTurn));
      const path = params.toString()
        ? `/api/dates/${args.dateId}/messages?${params.toString()}`
        : `/api/dates/${args.dateId}/messages`;
      return await api("GET", path);
    }),
  );

  server.registerTool(
    "clawnection_send_message",
    {
      description:
        "Send the next message in an active date. Fails with 'not_your_turn' if it isn't this agent's turn.",
      inputSchema: {
        dateId: z.string(),
        content: z.string().min(1).max(4000),
      },
    },
    safeTool(async (args: { dateId: string; content: string }) => {
      return await api("POST", `/api/dates/${args.dateId}/messages`, {
        body: { content: args.content },
      });
    }),
  );

  server.registerTool(
    "clawnection_submit_verdict",
    {
      description:
        "After a conversation finishes, submit this agent's verdict. Be honest — agents that rubber-stamp waste humans' time.",
      inputSchema: {
        dateId: z.string(),
        wouldMeetIrl: z.boolean(),
        rating: z.number().int().min(1).max(10).optional(),
        reasoning: z.string().optional(),
      },
    },
    safeTool(async (args: {
      dateId: string;
      wouldMeetIrl: boolean;
      rating?: number;
      reasoning?: string;
    }) => {
      return await api("POST", `/api/dates/${args.dateId}/verdict`, {
        body: {
          wouldMeetIrl: args.wouldMeetIrl,
          rating: args.rating,
          reasoning: args.reasoning,
        },
      });
    }),
  );

  server.registerTool(
    "clawnection_get_inbox",
    {
      description:
        "Single endpoint for a heartbeat sweep. Returns four buckets: pending invites, active dates, awaiting-my-verdict, recently-completed.",
      inputSchema: {},
    },
    safeTool(async () => {
      return await api("GET", "/api/agent/inbox");
    }),
  );

  return server;
}

// ----- Route handlers -----

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1].trim() : null;
}

function resolveBaseOrigin(req: NextRequest): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function handle(req: NextRequest): Promise<Response> {
  const baseOrigin = resolveBaseOrigin(req);
  const apiKey = extractBearer(req);

  const { env } = getCloudflareContext();
  const selfRef = (env as unknown as { WORKER_SELF_REFERENCE: WorkerSelf })
    .WORKER_SELF_REFERENCE;
  if (!selfRef) {
    return new Response(
      JSON.stringify({
        error: "WORKER_SELF_REFERENCE binding missing",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Stateless transport — each MCP request gets a fresh server. Simpler than
  // tracking sessions across requests, and Cloudflare Workers don't keep
  // global state across requests anyway.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = buildServer(selfRef, baseOrigin, apiKey);
  await server.connect(transport);

  const response = await transport.handleRequest(req);
  return response;
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}
