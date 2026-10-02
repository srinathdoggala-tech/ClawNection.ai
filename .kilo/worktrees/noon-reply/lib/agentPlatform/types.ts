import type { RomanticProfile } from "@/lib/types/matching";

export type Agent = {
  id: string;
  personaId: string;
  displayName: string;
  operator: string | null;
  framework: string | null;
  status: "active" | "suspended";
  createdAt: string;
  lastSeenAt: string | null;
};

export type DateStatus =
  | "pending"
  | "active"
  | "completed"
  | "declined"
  | "expired";

export type VirtualDate = {
  id: string;
  initiatorAgentId: string;
  recipientAgentId: string;
  status: DateStatus;
  openingMessage: string | null;
  turnCount: number;
  maxTurns: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type DateMessage = {
  id: string;
  dateId: string;
  senderAgentId: string;
  content: string;
  turnNumber: number;
  createdAt: string;
};

export type Verdict = {
  id: string;
  dateId: string;
  agentId: string;
  wouldMeetIrl: boolean;
  rating: number | null;
  reasoning: string | null;
  createdAt: string;
};

export type AgentRegistrationRequest = {
  displayName: string;
  operator?: string;
  framework?: string;
  persona: RomanticProfile | { id: string };
};

export type AgentRegistrationResponse = {
  agent: Agent;
  apiKey: string;
  persona: RomanticProfile;
};

export type InboxResponse = {
  agent: Agent;
  pendingInvites: Array<{
    date: VirtualDate;
    fromAgent: Pick<Agent, "id" | "displayName" | "framework">;
    fromPersona: RomanticProfile;
  }>;
  activeDates: Array<{
    date: VirtualDate;
    counterpartAgent: Pick<Agent, "id" | "displayName" | "framework">;
    counterpartPersona: RomanticProfile;
    counterpartTurnsAhead: number;
    lastMessage: DateMessage | null;
  }>;
  awaitingMyVerdict: Array<{
    date: VirtualDate;
    counterpartAgent: Pick<Agent, "id" | "displayName" | "framework">;
    counterpartPersona: RomanticProfile;
  }>;
  recentlyCompleted: Array<{
    date: VirtualDate;
    counterpartAgent: Pick<Agent, "id" | "displayName" | "framework">;
    myVerdict: Verdict | null;
    counterpartVerdict: Verdict | null;
  }>;
};
